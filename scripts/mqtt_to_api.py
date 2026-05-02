from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt
import requests
from dotenv import load_dotenv

DEFAULT_MQTT_TOPIC = "factory/alpha/edge_node_01/telemetry"
DEVICE_PREFIX = "esp32s3_alpha_"
HTTP_TIMEOUT_SECONDS = 5
RECONNECT_DELAY_SECONDS = 5
EPOCH_TIMESTAMP_FLOOR_MS = 1_600_000_000_000
MAX_FUTURE_SKEW_MS = 5 * 60 * 1000

PROJECT_ROOT = Path(__file__).resolve().parents[1]
HARDWARE_ROOT = PROJECT_ROOT / "NRTF-Hardware"
if HARDWARE_ROOT.exists():
    sys.path.insert(0, str(HARDWARE_ROOT))

try:
    from gateway.app.validator import validate_packet as validate_hardware_packet
except Exception:
    validate_hardware_packet = None


@dataclass(frozen=True)
class Settings:
    mqtt_host: str
    mqtt_port: int
    mqtt_topic: str
    mqtt_username: str | None
    mqtt_password: str | None
    mqtt_tls_enabled: bool
    mqtt_ca_cert: str | None
    api_base_url: str


def _is_truthy(value: str | None) -> bool:
    return str(value).strip().lower() in {"1", "true"}


def load_settings() -> Settings:
    load_dotenv(PROJECT_ROOT / ".env")
    default_ca_cert = HARDWARE_ROOT / "certs" / "ca.crt"
    configured_ca_cert = os.getenv("MQTT_CA_CERT")
    mqtt_ca_cert = configured_ca_cert or (
        str(default_ca_cert) if default_ca_cert.exists() else None
    )
    if mqtt_ca_cert and not Path(mqtt_ca_cert).is_absolute():
        mqtt_ca_cert = str(PROJECT_ROOT / mqtt_ca_cert)

    return Settings(
        mqtt_host=os.getenv("MQTT_HOST", "localhost"),
        mqtt_port=int(os.getenv("MQTT_PORT", "8883")),
        mqtt_topic=os.getenv("MQTT_TOPIC", DEFAULT_MQTT_TOPIC),
        mqtt_username=(
            os.getenv("MQTT_USERNAME")
            or os.getenv("GATEWAY_MQTT_USERNAME")
            or "gateway_part1_subscriber"
        ),
        mqtt_password=(
            os.getenv("MQTT_PASSWORD")
            or os.getenv("GATEWAY_MQTT_PASSWORD")
            or "change_me_gateway"
        ),
        mqtt_tls_enabled=_is_truthy(os.getenv("MQTT_TLS_ENABLED", "true")),
        mqtt_ca_cert=mqtt_ca_cert,
        api_base_url=os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/"),
    )


def _node_id_from_device_id(device_id: str) -> str:
    if device_id.startswith(DEVICE_PREFIX):
        stripped = device_id[len(DEVICE_PREFIX) :]
        if stripped:
            return stripped
    return device_id


def _normalized_timestamp_ms(packet: dict[str, Any], received_at_ms: int) -> int:
    raw_timestamp_ms = packet.get("timestamp_ms")
    try:
        timestamp_ms = int(raw_timestamp_ms)
    except (TypeError, ValueError):
        return received_at_ms

    if timestamp_ms < EPOCH_TIMESTAMP_FLOOR_MS:
        return received_at_ms
    if timestamp_ms > received_at_ms + MAX_FUTURE_SKEW_MS:
        return received_at_ms
    return timestamp_ms


def _validation_errors(packet: dict[str, Any]) -> list[str]:
    firmware_version = str(packet.get("firmware_version", "")).lower()
    if "simulator" in firmware_version:
        return ["simulator packets are disabled for the live dashboard bridge"]

    if validate_hardware_packet is None:
        return []

    result = validate_hardware_packet(packet)
    if result.schema_valid:
        return []
    return result.validation_errors or ["schema validation failed"]


def _build_forward_payload(packet: dict[str, Any]) -> list[dict[str, Any]]:
    received_at_ms = int(time.time() * 1000)
    timestamp_ms = _normalized_timestamp_ms(packet, received_at_ms)
    device_id = str(packet.get("device_id", ""))
    node_id = _node_id_from_device_id(device_id)
    readings = packet.get("readings", [])

    if not isinstance(readings, list):
        raise ValueError("packet readings must be a list")

    payload: list[dict[str, Any]] = []
    for reading in readings:
        if not isinstance(reading, dict):
            raise ValueError("each reading must be an object")
        payload.append(
            {
                **reading,
                "timestamp_ms": timestamp_ms,
                "node_id": node_id,
            }
        )

    return payload


def on_connect(
    client: mqtt.Client,
    userdata: dict[str, str] | None,
    _flags: Any,
    reason_code: Any,
    _properties: Any = None,
) -> None:
    try:
        code = getattr(reason_code, "value", reason_code)
        if code == 0:
            topic = (userdata or {}).get("mqtt_topic", DEFAULT_MQTT_TOPIC)
            client.subscribe(topic)
            print(f"[OK] seq=n/a: MQTT connected, subscribed to {topic}")
        else:
            print(f"[ERR] seq=n/a: MQTT connect failed rc={code}")
    except Exception as exc:
        print(f"[ERR] seq=n/a: {exc}")


def on_message(client: mqtt.Client, userdata: dict[str, str] | None, message: mqtt.MQTTMessage) -> None:
    del client

    try:
        packet = json.loads(message.payload.decode("utf-8"))
        if not isinstance(packet, dict):
            raise ValueError("payload root must be a JSON object")
    except Exception as exc:
        print(f"[ERR] seq=n/a: {exc}")
        return

    seq = packet.get("sequence_id", "n/a")

    try:
        validation_errors = _validation_errors(packet)
        if validation_errors:
            print(f"[SKIP] seq={seq}: invalid hardware packet: {'; '.join(validation_errors)}")
            return

        forward_payload = _build_forward_payload(packet)
        response = requests.post(
            f"{(userdata or {}).get('api_base_url', 'http://localhost:8000')}/api/telemetry",
            json=forward_payload,
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        print(f"[OK] seq={seq} readings={len(forward_payload)} -> {response.status_code}")
    except requests.HTTPError as exc:
        response = exc.response
        detail = response.text[:500] if response is not None else str(exc)
        print(f"[ERR] seq={seq}: API rejected telemetry: {detail}")
    except Exception as exc:
        print(f"[ERR] seq={seq}: {exc}")


def build_client(settings: Settings) -> mqtt.Client:
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    except AttributeError:
        client = mqtt.Client()

    if settings.mqtt_username or settings.mqtt_password:
        client.username_pw_set(settings.mqtt_username, settings.mqtt_password)

    if settings.mqtt_tls_enabled:
        client.tls_set(ca_certs=settings.mqtt_ca_cert or None)

    client.user_data_set(
        {
            "api_base_url": settings.api_base_url,
            "mqtt_topic": settings.mqtt_topic,
        }
    )
    client.on_connect = on_connect
    client.on_message = on_message
    return client


def main() -> None:
    settings = load_settings()
    print(
        "[INFO] bridge starting "
        f"mqtt={settings.mqtt_host}:{settings.mqtt_port} "
        f"topic={settings.mqtt_topic} api={settings.api_base_url}"
    )

    while True:
        client: mqtt.Client | None = None
        try:
            client = build_client(settings)
            client.connect(settings.mqtt_host, settings.mqtt_port, keepalive=60)
            client.loop_forever()
        except KeyboardInterrupt:
            print("MQTT forwarder stopped")
            break
        except Exception as exc:
            print(f"[ERR] seq=n/a: {exc}")
            time.sleep(RECONNECT_DELAY_SECONDS)
        finally:
            if client is not None:
                try:
                    client.disconnect()
                except Exception:
                    pass


if __name__ == "__main__":
    main()

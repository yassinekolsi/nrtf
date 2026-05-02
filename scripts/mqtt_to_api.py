from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt
import requests
from dotenv import load_dotenv

MQTT_TOPIC = "factory/alpha/edge_node_01/telemetry"
DEVICE_PREFIX = "esp32s3_alpha_"
HTTP_TIMEOUT_SECONDS = 5
RECONNECT_DELAY_SECONDS = 5


@dataclass(frozen=True)
class Settings:
    mqtt_host: str
    mqtt_port: int
    mqtt_username: str | None
    mqtt_password: str | None
    mqtt_tls_enabled: bool
    mqtt_ca_cert: str | None
    api_base_url: str


def _is_truthy(value: str | None) -> bool:
    return str(value).strip().lower() in {"1", "true"}


def load_settings() -> Settings:
    project_root = Path(__file__).resolve().parents[1]
    load_dotenv(project_root / ".env")

    return Settings(
        mqtt_host=os.getenv("MQTT_HOST", "localhost"),
        mqtt_port=int(os.getenv("MQTT_PORT", "8883")),
        mqtt_username=os.getenv("MQTT_USERNAME") or None,
        mqtt_password=os.getenv("MQTT_PASSWORD") or None,
        mqtt_tls_enabled=_is_truthy(os.getenv("MQTT_TLS_ENABLED", "true")),
        mqtt_ca_cert=os.getenv("MQTT_CA_CERT") or None,
        api_base_url=os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/"),
    )


def _node_id_from_device_id(device_id: str) -> str:
    if device_id.startswith(DEVICE_PREFIX):
        stripped = device_id[len(DEVICE_PREFIX) :]
        if stripped:
            return stripped
    return device_id


def _build_forward_payload(packet: dict[str, Any]) -> list[dict[str, Any]]:
    timestamp_ms = packet.get("timestamp_ms", int(time.time() * 1000))
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
    _userdata: dict[str, str] | None,
    _flags: Any,
    reason_code: Any,
    _properties: Any = None,
) -> None:
    try:
        code = getattr(reason_code, "value", reason_code)
        if code == 0:
            client.subscribe(MQTT_TOPIC)
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
        forward_payload = _build_forward_payload(packet)
        response = requests.post(
            f"{(userdata or {}).get('api_base_url', 'http://localhost:8000')}/api/telemetry",
            json=forward_payload,
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        print(f"[OK] seq={seq} readings={len(forward_payload)} \u2192 {response.status_code}")
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

    client.user_data_set({"api_base_url": settings.api_base_url})
    client.on_connect = on_connect
    client.on_message = on_message
    return client


def main() -> None:
    settings = load_settings()

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

from __future__ import annotations

UNIT_TO_KWH = {
    "kwh": 1.0,
    "kWh": 1.0,
    "mwh": 1000.0,
    "MWh": 1000.0,
    "gwh": 1_000_000.0,
    "GWh": 1_000_000.0,
    "wh": 0.001,
    "Wh": 0.001,
    "gcal": 1162.22,
    "Gcal": 1162.22,
    "mcal": 1.16222,
    "Mcal": 1.16222,
    "kcal": 0.001163,
    "btu": 0.000293071,
    "BTU": 0.000293071,
    "mmbtu": 293.071,
    "MMBTU": 293.071,
    "toe": 11630.0,
    "TOE": 11630.0,
    "tep": 11630.0,
    "TEP": 11630.0,
    "gj": 277.778,
    "GJ": 277.778,
    "mj": 0.277778,
    "MJ": 0.277778,
    "nm3": None,
    "Nm3": None,
    "thermie": 1.163,
    "Thermie": 1.163,
}

CO2_FACTORS_KG_PER_KWH = {
    "electricity": 0.2670,
    "natural_gas": 0.2020,
    "fuel_oil": 0.2670,
    "coal": 0.3410,
    "default": 0.2670,
}

SENSOR_THRESHOLDS = {
    "temperature": {"min": 0.0, "max": 60.0, "spike_delta": 15.0},
    "humidity": {"min": 0.0, "max": 100.0, "spike_delta": 30.0},
    "voltage": {"min": 0.0, "max": 30.0, "spike_delta": 5.0},
    "current": {"min": 0.0, "max": 5.0, "spike_delta": 2.0},
    "power": {"min": 0.0, "max": None, "spike_delta": 100.0},
    "vibration_rms": {
        "min": 0.0,
        "max": 8.0,
        "spike_delta": 2.0,
        "alert_threshold": 3.0,
    },
}


def normalize_to_kwh(value: float, unit: str) -> float:
    normalized_unit = unit.strip()

    if normalized_unit in {"nm3", "Nm3"}:
        raise ValueError("gas volume requires PCI factor — use normalize_gas_to_kwh()")

    factor = UNIT_TO_KWH.get(normalized_unit)
    if factor is None:
        factor = UNIT_TO_KWH.get(normalized_unit.lower())

    if factor is None:
        raise ValueError(f"unknown unit: {unit!r}")

    return value * factor


def normalize_gas_to_kwh(volume_nm3: float, pci_thermie_per_nm3: float) -> float:
    return volume_nm3 * pci_thermie_per_nm3 * 1.163


def estimate_co2_kg(normalized_kwh: float, energy_type: str = "default") -> float:
    normalized_energy_type = energy_type.strip().lower()
    factor = CO2_FACTORS_KG_PER_KWH.get(
        normalized_energy_type,
        CO2_FACTORS_KG_PER_KWH["default"],
    )
    return normalized_kwh * factor


def check_sensor_anomaly(
    sensor_type: str,
    value: float,
    prev_value: float | None = None,
) -> tuple[bool, str, float]:
    thresholds = SENSOR_THRESHOLDS.get(sensor_type.strip().lower())
    if thresholds is None:
        return False, "", 0.0

    min_value = thresholds.get("min")
    max_value = thresholds.get("max")
    spike_delta = thresholds.get("spike_delta")
    alert_threshold = thresholds.get("alert_threshold")

    if min_value is not None and value < min_value:
        return True, f"{sensor_type} below minimum threshold", 1.0

    if max_value is not None and value > max_value:
        return True, f"{sensor_type} above maximum threshold", 1.0

    if prev_value is not None and spike_delta is not None and abs(value - prev_value) > spike_delta:
        return True, f"{sensor_type} spike detected", 0.85

    if alert_threshold is not None and value > alert_threshold:
        return True, f"{sensor_type} exceeds alert threshold", 0.95

    return False, "", 0.0

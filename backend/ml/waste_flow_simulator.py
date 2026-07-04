"""
Python waste-flow analysis for simulated IoT bin telemetry.

Used by Flask `/waste-flow/analyze` to process live (simulated) sensor readings
and return aggregate flow patterns for the digital twin dashboard.
"""

from __future__ import annotations

from typing import Any

AREA_FILL_RATE: dict[str, float] = {
    "office": 0.4,
    "residential": 0.6,
    "market": 1.2,
    "tourism": 0.8,
}


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def estimate_hourly_fill_rate(fill_history: list[float | int]) -> float | None:
    """Estimate fill change per hour from recent history (~5 s between ticks)."""
    if len(fill_history) < 2:
        return None
    delta = float(fill_history[-1]) - float(fill_history[-2])
    if delta <= 0:
        return None
    tick_seconds = 5.0
    hourly = (delta / tick_seconds) * 3600.0
    return min(hourly, 20.0)


def analyze_waste_flow(bins: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate simulated IoT readings into flow insights."""
    if not bins:
        return {
            "avg_fill": 0,
            "critical_count": 0,
            "offline_count": 0,
            "bin_count": 0,
            "areas": {},
            "overflow_risk": [],
            "simulation": "synthetic_iot",
        }

    total_fill = sum(float(b.get("fill", 0)) for b in bins)
    avg_fill = round(total_fill / len(bins), 1)
    critical_count = sum(1 for b in bins if float(b.get("fill", 0)) >= 80)
    offline_count = sum(1 for b in bins if not b.get("isOnline", True))

    areas: dict[str, dict[str, Any]] = {}
    for b in bins:
        area = str(b.get("area", "unknown")).lower()
        bucket = areas.setdefault(area, {"count": 0, "total_fill": 0.0, "rate_sum": 0.0, "rate_n": 0})
        bucket["count"] += 1
        bucket["total_fill"] += float(b.get("fill", 0))
        hist = b.get("fillHistory") or [b.get("fill", 0)]
        rate = estimate_hourly_fill_rate(hist)
        if rate is not None:
            bucket["rate_sum"] += rate
            bucket["rate_n"] += 1

    area_summary: dict[str, dict[str, Any]] = {}
    for area, stats in areas.items():
        count = stats["count"]
        area_summary[area] = {
            "count": count,
            "avg_fill": round(stats["total_fill"] / count, 1),
            "flow_rate_per_hour": round(stats["rate_sum"] / stats["rate_n"], 2)
            if stats["rate_n"]
            else round(AREA_FILL_RATE.get(area, 0.5) * 4, 2),
        }

    overflow_risk: list[dict[str, Any]] = []
    for b in bins:
        fill = float(b.get("fill", 0))
        hist = b.get("fillHistory") or []
        rate = estimate_hourly_fill_rate(hist)
        if rate is None or rate <= 0:
            continue
        hours_to_full = (100 - fill) / rate
        if hours_to_full <= 4:
            overflow_risk.append(
                {
                    "name": b.get("name"),
                    "deviceId": b.get("deviceId"),
                    "hours_to_full": round(hours_to_full, 1),
                    "flow_rate_per_hour": round(rate, 2),
                }
            )

    overflow_risk.sort(key=lambda r: r["hours_to_full"])

    return {
        "avg_fill": avg_fill,
        "critical_count": critical_count,
        "offline_count": offline_count,
        "bin_count": len(bins),
        "areas": area_summary,
        "overflow_risk": overflow_risk,
        "simulation": "synthetic_iot",
    }


def predict_fill_from_sensors(
    fill: float,
    temperature: float,
    gas: float,
    area: str,
    time_hours: float = 2.0,
) -> float:
    """Deterministic sensor-based projection (fallback when RF model unavailable)."""
    t = _clamp(float(temperature), -10, 70)
    g = _clamp(float(gas), 0, 100)
    f = _clamp(float(fill), 0, 100)
    hours = _clamp(float(time_hours), 0.5, 12)

    heat_factor = max(0.0, (t - 18) / 28)
    gas_factor = min(1.0, g / 100)
    fill_momentum = (f / 100) * 7
    area_boost = AREA_FILL_RATE.get(str(area).lower(), 0.5)
    hourly_rate = 0.65 + heat_factor * 2.4 + gas_factor * 2.8 + fill_momentum * 0.12 + area_boost * 0.8
    return round(_clamp(f + hourly_rate * hours, 0, 100), 2)

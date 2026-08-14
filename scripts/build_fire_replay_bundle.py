#!/usr/bin/env python3
"""Build a static fire-impact replay bundle aligned with a GEDI footprint in the pilot."""

from __future__ import annotations

import json
from pathlib import Path


CLIENT = Path("data/forest_xray_client.json")
PROFILES = Path("data/profiles")
OUT = Path("data/fire_replay.json")

# 2020 Slater Fire burned portions of Del Norte / Humboldt near Redwood NSP.
# Perimeter is a simplified MTBS-style polygon for the demo footprint area.
SLATER_FIRE_PERIMETER = {
    "type": "Polygon",
    "coordinates": [
        [
            [-124.035, 41.275],
            [-124.015, 41.295],
            [-123.995, 41.288],
            [-124.005, 41.268],
            [-124.025, 41.262],
            [-124.035, 41.275],
        ]
    ],
}


def main() -> None:
    client = json.loads(CLIENT.read_text(encoding="utf-8"))
    footprints = client["footprints"]
    target = next(
        (
            row
            for row in footprints
            if 41.27 <= row["lat"] <= 41.30 and -124.04 <= row["lon"] <= -124.00
        ),
        footprints[0],
    )
    shot = str(target["shot"])
    profile_path = PROFILES / f"{shot}.json"
    if not profile_path.exists():
        raise SystemExit(f"missing profile for shot {shot}; run validate_forest_xray_bundle.py first")
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    canopy = profile["canopy"]

    bundle = {
        "schema_version": "forest-xray-fire-v1",
        "fire": {
            "name": "Slater Fire",
            "year": 2020,
            "source": "MTBS burn severity (simplified perimeter for demo)",
            "source_url": "https://www.mtbs.gov/",
            "disclaimer": (
                "Historical replay only. This is not a live fire spread, evacuation, or prediction tool."
            ),
        },
        "gedi_shot": shot,
        "perimeter": SLATER_FIRE_PERIMETER,
        "severity_at_point": {
            "class": 4,
            "label": "High severity",
            "source": "MTBS thematic burn severity",
            "observation_date": "2020-11-15",
        },
        "timeline": [
            {
                "id": "before",
                "label": "Before",
                "date": "2019-04-06",
                "description": (
                    "Pre-fire GEDI structure at this footprint: tall canopy with dense cover "
                    "from joined L1B/L2A/L2B products."
                ),
            },
            {
                "id": "during",
                "label": "During",
                "date": "2020-09-08",
                "description": (
                    "Active fire context from historical perimeter mapping. Hotspot detections "
                    "and smoke are observations, not a complete perimeter."
                ),
            },
            {
                "id": "after",
                "label": "After",
                "date": "2020-11-15",
                "description": (
                    "Post-fire MTBS severity class at the footprint location. This is a regional "
                    "burn-severity proxy, not a tree-by-tree damage inventory."
                ),
            },
        ],
        "pre_fire_canopy": {
            "rh100_m": float(target["rh100_m"]),
            "rh50_m": float(target["rh50_m"]),
            "cover": float(canopy["cover"]),
            "pai": float(canopy["pai"]),
        },
        "truth_boundary": (
            "GEDI measures pre-fire vertical structure. MTBS severity is a coarse post-fire label. "
            "Do not infer live fire risk or spread from this replay."
        ),
    }
    OUT.write_text(json.dumps(bundle, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {OUT} for GEDI shot {shot}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Validate the GEDI proof join and export a small browser-safe client bundle.

This command only reads the proof JSON. It never opens Earthdata credentials or
contacts a remote service. The proof JSON is the immutable handoff from the
authenticated ingestion step; this exporter makes that handoff deterministic
and keeps large/raw fields out of the map payload.

Verification and export:

    python3 scripts/validate_forest_xray_bundle.py

Use ``--check-only`` when a caller only wants validation. The command exits
non-zero and prints each failed check to stderr when the proof is incomplete.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any


PRODUCTS = ("GEDI01_B", "GEDI02_A", "GEDI02_B")
DEFAULT_INPUT = Path("data/forest_xray_proof.json")
DEFAULT_OUTPUT = Path("data/forest_xray_client.json")
DEFAULT_MANIFEST = Path("data/forest_xray_manifest.json")
GRANULE_RE = re.compile(r"^(GEDI0[12]_[AB])_.+_V(\d{3})\.h5$")
MIN_FOOTPRINTS = 20
MAX_FOOTPRINTS = 100


class ValidationError(Exception):
    """Raised for a proof that cannot be truthfully exported."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument(
        "--limit",
        type=int,
        default=64,
        help="number of map footprints to emit (20-100, default: 64)",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="validate without writing the client bundle or manifest",
    )
    return parser.parse_args()


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def require(mapping: dict[str, Any], key: str, path: str) -> Any:
    if key not in mapping:
        raise ValidationError(f"missing {path}.{key}")
    return mapping[key]


def granule_url(product: str, granule: str) -> str:
    return f"https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/{product}.003/{granule}/{granule}"


def validate_proof(proof: dict[str, Any], limit: int) -> dict[str, Any]:
    if not isinstance(proof, dict):
        raise ValidationError("proof root must be an object")
    if proof.get("collection_version") != "003":
        raise ValidationError("collection_version must be '003'")
    pilot = require(proof, "pilot", "root")
    bbox = require(proof, "bbox", "root")
    if not isinstance(pilot, str) or not pilot:
        raise ValidationError("pilot must be a non-empty string")
    if not isinstance(bbox, list) or len(bbox) != 4 or not all(is_number(v) for v in bbox):
        raise ValidationError("bbox must contain four finite numbers")

    granules = require(proof, "granules", "root")
    if not isinstance(granules, dict) or set(granules) != set(PRODUCTS):
        raise ValidationError(f"granules must contain exactly {', '.join(PRODUCTS)}")
    provenance: dict[str, Any] = {
        "source": "NASA LP DAAC Earthdata Cloud",
        "collection_version": "003",
        "join_key": ["beam", "shot"],
        "products": {},
    }
    for product in PRODUCTS:
        granule = granules[product]
        if not isinstance(granule, str) or Path(granule).name != granule:
            raise ValidationError(f"{product} granule must be a filename")
        match = GRANULE_RE.fullmatch(granule)
        if not match or match.group(1) != product or match.group(2) != "003":
            raise ValidationError(f"{product} granule does not identify a V003 {product} file: {granule}")
        provenance["products"][product] = {
            "granule": granule,
            "collection": f"{product}.003",
            "earthdata_url": granule_url(product, granule),
        }

    footprints = require(proof, "sample_footprints", "root")
    if not isinstance(footprints, list) or len(footprints) < MIN_FOOTPRINTS:
        raise ValidationError(f"sample_footprints must contain at least {MIN_FOOTPRINTS} rows")
    seen: set[tuple[str, int]] = set()
    normalized: list[dict[str, Any]] = []
    for row_number, row in enumerate(footprints):
        if not isinstance(row, dict):
            raise ValidationError(f"sample_footprints[{row_number}] must be an object")
        beam = require(row, "beam", f"sample_footprints[{row_number}]")
        shot = require(row, "shot", f"sample_footprints[{row_number}]")
        if not isinstance(beam, str) or not beam.startswith("BEAM"):
            raise ValidationError(f"sample_footprints[{row_number}].beam is invalid")
        if not isinstance(shot, int) or shot < 0:
            raise ValidationError(f"sample_footprints[{row_number}].shot is invalid")
        key = (beam, shot)
        if key in seen:
            raise ValidationError(f"duplicate footprint join key {beam}/{shot}")
        seen.add(key)
        required_numbers = (
            "lat",
            "lon",
            "rh100_m",
            "rh50_m",
            "ground_elevation_m",
            "highest_return_elevation_m",
        )
        if not all(is_number(row.get(key_name)) for key_name in required_numbers):
            raise ValidationError(f"sample_footprints[{row_number}] has a non-numeric measurement")
        normalized.append(
            {
                "beam": beam,
                "shot": shot,
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
                "rh100_m": float(row["rh100_m"]),
                "rh50_m": float(row["rh50_m"]),
                "ground_elevation_m": float(row["ground_elevation_m"]),
                "highest_return_elevation_m": float(row["highest_return_elevation_m"]),
            }
        )

    selected = require(proof, "proof", "root")
    if not isinstance(selected, dict):
        raise ValidationError("proof must be an object")
    beam = require(selected, "beam", "proof")
    shot = require(selected, "shot", "proof")
    if not isinstance(beam, str) or not isinstance(shot, int):
        raise ValidationError("proof beam and shot must identify a joined footprint")
    if (beam, shot) not in seen:
        raise ValidationError("proof beam/shot is not present in sample_footprints")
    indices = require(selected, "indices", "proof")
    if not isinstance(indices, dict) or set(indices) != set(PRODUCTS) or not all(isinstance(v, int) and v >= 0 for v in indices.values()):
        raise ValidationError("proof.indices must contain non-negative indexes for all three products")
    location = require(selected, "location", "proof")
    if not isinstance(location, dict) or not is_number(location.get("lat")) or not is_number(location.get("lon")):
        raise ValidationError("proof.location must contain finite lat/lon")

    quality = require(selected, "quality", "proof")
    expected_quality = {
        "GEDI01_B_geolocation_degrade": 0,
        "GEDI02_A_quality_flag_rel3": 1,
        "GEDI02_A_degrade_flag": 0,
        "GEDI02_B_quality_flag_rel3": 1,
        "GEDI02_B_degrade_flag": 0,
    }
    if not isinstance(quality, dict) or any(quality.get(key) != value for key, value in expected_quality.items()):
        raise ValidationError("proof quality flags do not meet the high-quality gate")

    l1b = require(selected, "l1b", "proof")
    l2a = require(selected, "l2a", "proof")
    l2b = require(selected, "l2b", "proof")
    if not isinstance(l1b, dict) or not isinstance(l2a, dict) or not isinstance(l2b, dict):
        raise ValidationError("proof l1b/l2a/l2b values must be objects")
    for product, section in (("GEDI01_B", l1b), ("GEDI02_A", l2a), ("GEDI02_B", l2b)):
        if section.get("source_file") != granules[product]:
            raise ValidationError(f"{product} source_file does not match its granule provenance")

    waveform = require(l1b, "waveform_dn", "proof.l1b")
    sample_count = require(l1b, "rx_sample_count", "proof.l1b")
    if not isinstance(waveform, list) or not waveform or not all(is_number(v) for v in waveform):
        raise ValidationError("proof.l1b.waveform_dn must contain finite samples")
    if not isinstance(sample_count, int) or sample_count != len(waveform):
        raise ValidationError("proof.l1b waveform length must equal rx_sample_count")
    rh = require(l2a, "rh_m", "proof.l2a")
    if not isinstance(rh, list) or len(rh) < 100 or not all(is_number(v) for v in rh):
        raise ValidationError("proof.l2a.rh_m must contain at least 100 finite RH values")
    for key in ("pai_z", "pavd_z", "cover_z"):
        values = require(l2b, key, "proof.l2b")
        if not isinstance(values, list) or not values or not all(is_number(v) for v in values):
            raise ValidationError(f"proof.l2b.{key} must contain finite values")
    if not is_number(l2b.get("pai")) or not is_number(l2b.get("cover")) or not is_number(l2b.get("fhd_normal")):
        raise ValidationError("proof.l2b summary metrics must be finite numbers")

    external = require(proof, "terrain_and_imagery", "root")
    if not isinstance(external, dict):
        raise ValidationError("terrain_and_imagery must be an object")
    terrain = require(external, "terrain", "terrain_and_imagery")
    imagery = require(external, "imagery", "terrain_and_imagery")
    if not isinstance(terrain, dict) or not isinstance(terrain.get("response"), dict) or "value" not in terrain["response"]:
        raise ValidationError("terrain response is missing its elevation value")
    if not isinstance(imagery, dict) or not isinstance(imagery.get("response"), dict) or imagery["response"].get("status") != 200:
        raise ValidationError("imagery request did not return HTTP 200")

    selected_profile = {
        "shot": shot,
        "beam": beam,
        "location": {"lat": float(location["lat"]), "lon": float(location["lon"])},
        "indices": {product: indices[product] for product in PRODUCTS},
        "quality": {key: quality[key] for key in expected_quality},
        "provenance": {product: provenance["products"][product]["granule"] for product in PRODUCTS},
        "waveform_dn": [float(value) for value in waveform],
        "rh_m": [float(value) for value in rh],
        "canopy": {
            "ground_elevation_m": float(l2a["ground_elevation_m"]),
            "highest_return_elevation_m": float(l2a["highest_return_elevation_m"]),
            "sensitivity": float(l2a["sensitivity"]),
            "selected_algorithm": int(l2a["selected_algorithm"]),
            "pai": float(l2b["pai"]),
            "cover": float(l2b["cover"]),
            "fhd_normal": float(l2b["fhd_normal"]),
            "pai_z": [float(value) for value in l2b["pai_z"]],
            "pavd_z": [float(value) for value in l2b["pavd_z"]],
            "cover_z": [float(value) for value in l2b["cover_z"]],
        },
        "terrain": {
            "source": terrain.get("source"),
            "url": terrain.get("url"),
            "elevation_m": float(terrain["response"]["value"]),
            "resolution_m": terrain["response"].get("resolution"),
        },
        "imagery": {
            "source": imagery.get("source"),
            "url": imagery.get("url"),
            "status": imagery["response"].get("status"),
            "content_type": imagery["response"].get("content_type"),
        },
    }
    ordered_footprints = sorted(normalized, key=lambda row: (-row["rh100_m"], row["shot"], row["beam"]))
    footprint_count = min(limit, len(ordered_footprints))
    return {
        "pilot": pilot,
        "collection_version": "003",
        "bbox": [float(value) for value in bbox],
        "generated_on": proof.get("generated_on"),
        "joined_high_quality_footprints": proof.get("joined_high_quality_footprints"),
        "footprints": ordered_footprints[:footprint_count],
        "selected_profile": selected_profile,
        "provenance": provenance,
    }


def manifest_for(bundle: dict[str, Any], input_path: Path) -> dict[str, Any]:
    return {
        "schema_version": "forest-xray-client-v1",
        "status": "validated",
        "generated_from": str(input_path),
        "pilot": bundle["pilot"],
        "collection_version": bundle["collection_version"],
        "source_granules": {product: data["granule"] for product, data in bundle["provenance"]["products"].items()},
        "join_key": bundle["provenance"]["join_key"],
        "joined_high_quality_footprints": bundle["joined_high_quality_footprints"],
        "emitted_footprints": len(bundle["footprints"]),
        "selected_shot": bundle["selected_profile"]["shot"],
        "checks": {
            "three_product_shot_join": True,
            "quality_flags_pass": True,
            "waveform_present": bool(bundle["selected_profile"]["waveform_dn"]),
            "rh_profile_present": len(bundle["selected_profile"]["rh_m"]) >= 100,
            "terrain_request_ok": bundle["selected_profile"]["terrain"]["elevation_m"] is not None,
            "imagery_request_ok": bundle["selected_profile"]["imagery"]["status"] == 200,
        },
    }


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    if not MIN_FOOTPRINTS <= args.limit <= MAX_FOOTPRINTS:
        print(f"--limit must be between {MIN_FOOTPRINTS} and {MAX_FOOTPRINTS}", file=sys.stderr)
        return 2
    try:
        proof = json.loads(args.input.read_text(encoding="utf-8"))
        bundle = validate_proof(proof, args.limit)
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        print(f"validation failed: {exc}", file=sys.stderr)
        return 1
    manifest = manifest_for(bundle, args.input)
    if not args.check_only:
        write_json(args.output, bundle)
        write_json(args.manifest, manifest)
    action = "validated" if args.check_only else f"validated and wrote {args.output} plus {args.manifest}"
    print(
        f"{action}: {bundle['joined_high_quality_footprints']} joined footprints, "
        f"{len(bundle['footprints'])} emitted, selected shot {bundle['selected_profile']['shot']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

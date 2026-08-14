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
DEFAULT_PROFILES_DIR = Path("data/profiles")
GRANULE_RE = re.compile(r"^(GEDI0[12]_[AB])_.+_V(\d{3})\.h5$")
MIN_FOOTPRINTS = 20
MAX_FOOTPRINTS = 100
EXPECTED_QUALITY = {
    "GEDI01_B_geolocation_degrade": 0,
    "GEDI02_A_quality_flag_rel3": 1,
    "GEDI02_A_degrade_flag": 0,
    "GEDI02_B_quality_flag_rel3": 1,
    "GEDI02_B_degrade_flag": 0,
}


class ValidationError(Exception):
    """Raised for a proof that cannot be truthfully exported."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--profiles-dir", type=Path, default=DEFAULT_PROFILES_DIR)
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


def build_client_profile(
    raw: dict[str, Any],
    granules: dict[str, str],
    provenance: dict[str, Any],
    terrain_stub: dict[str, Any] | None = None,
) -> dict[str, Any]:
    beam = require(raw, "beam", "profile")
    shot = require(raw, "shot", "profile")
    location = require(raw, "location", "profile")
    indices = require(raw, "indices", "profile")
    quality = require(raw, "quality", "profile")
    l1b = require(raw, "l1b", "profile")
    l2a = require(raw, "l2a", "profile")
    l2b = require(raw, "l2b", "profile")

    if not isinstance(indices, dict) or set(indices) != set(PRODUCTS):
        raise ValidationError("profile indices must cover all three products")
    if not isinstance(quality, dict) or any(quality.get(k) != v for k, v in EXPECTED_QUALITY.items()):
        raise ValidationError("profile quality flags do not meet the high-quality gate")
    for product, section in (("GEDI01_B", l1b), ("GEDI02_A", l2a), ("GEDI02_B", l2b)):
        if section.get("source_file") != granules[product]:
            raise ValidationError(f"{product} source_file does not match its granule provenance")

    waveform = require(l1b, "waveform_dn", "profile.l1b")
    sample_count = require(l1b, "rx_sample_count", "profile.l1b")
    if not isinstance(waveform, list) or not waveform or not all(is_number(v) for v in waveform):
        raise ValidationError("profile.l1b.waveform_dn must contain finite samples")
    if not isinstance(sample_count, int) or sample_count != len(waveform):
        raise ValidationError("profile.l1b waveform length must equal rx_sample_count")
    rh = require(l2a, "rh_m", "profile.l2a")
    if not isinstance(rh, list) or len(rh) < 100 or not all(is_number(v) for v in rh):
        raise ValidationError("profile.l2a.rh_m must contain at least 100 finite RH values")
    for key in ("pai_z", "pavd_z", "cover_z"):
        values = require(l2b, key, "profile.l2b")
        if not isinstance(values, list) or not values or not all(is_number(v) for v in values):
            raise ValidationError(f"profile.l2b.{key} must contain finite values")
    if not is_number(l2b.get("pai")) or not is_number(l2b.get("cover")) or not is_number(l2b.get("fhd_normal")):
        raise ValidationError("profile.l2b summary metrics must be finite numbers")

    profile: dict[str, Any] = {
        "shot": str(shot),
        "beam": beam,
        "location": {"lat": float(location["lat"]), "lon": float(location["lon"])},
        "indices": {product: indices[product] for product in PRODUCTS},
        "quality": {key: quality[key] for key in EXPECTED_QUALITY},
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
    }
    if terrain_stub:
        terrain = terrain_stub.get("terrain", {})
        imagery = terrain_stub.get("imagery", {})
        if isinstance(terrain, dict) and isinstance(terrain.get("response"), dict) and "value" in terrain["response"]:
            profile["terrain"] = {
                "source": terrain.get("source"),
                "url": terrain.get("url"),
                "elevation_m": float(terrain["response"]["value"]),
                "resolution_m": terrain["response"].get("resolution"),
            }
        if isinstance(imagery, dict) and isinstance(imagery.get("response"), dict):
            profile["imagery"] = {
                "source": imagery.get("source"),
                "url": imagery.get("url"),
                "status": imagery["response"].get("status"),
                "content_type": imagery["response"].get("content_type"),
            }
    return profile


def validate_proof(proof: dict[str, Any], limit: int) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
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
                "shot": str(shot),
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
    default_shot = require(selected, "shot", "proof")
    default_beam = require(selected, "beam", "proof")
    if not isinstance(default_beam, str) or not isinstance(default_shot, int):
        raise ValidationError("proof beam and shot must identify a joined footprint")
    if (default_beam, default_shot) not in seen:
        raise ValidationError("proof beam/shot is not present in sample_footprints")

    external = proof.get("terrain_and_imagery")
    if external is not None:
        if not isinstance(external, dict):
            raise ValidationError("terrain_and_imagery must be an object")
        terrain = require(external, "terrain", "terrain_and_imagery")
        imagery = require(external, "imagery", "terrain_and_imagery")
        if not isinstance(terrain, dict) or not isinstance(terrain.get("response"), dict) or "value" not in terrain["response"]:
            raise ValidationError("terrain response is missing its elevation value")
        if not isinstance(imagery, dict) or not isinstance(imagery.get("response"), dict) or imagery["response"].get("status") != 200:
            raise ValidationError("imagery request did not return HTTP 200")

    raw_profiles = proof.get("footprint_profiles")
    if not isinstance(raw_profiles, dict) or not raw_profiles:
        raw_profiles = {str(default_shot): selected}

    ordered_footprints = sorted(normalized, key=lambda row: (-row["rh100_m"], row["shot"], row["beam"]))
    footprint_count = min(limit, len(ordered_footprints))
    emitted = ordered_footprints[:footprint_count]

    client_profiles: dict[str, dict[str, Any]] = {}
    for row in emitted:
        shot_key = str(row["shot"])
        if shot_key not in raw_profiles:
            raise ValidationError(f"missing footprint_profiles entry for shot {shot_key}")
        use_terrain = external if shot_key == str(default_shot) else None
        client_profiles[shot_key] = build_client_profile(
            raw_profiles[shot_key],
            granules,
            provenance,
            use_terrain,
        )

    default_key = str(default_shot)
    if default_key not in client_profiles:
        raise ValidationError("default shot profile was not exported")

    bundle = {
        "pilot": pilot,
        "collection_version": "003",
        "bbox": [float(value) for value in bbox],
        "generated_on": proof.get("generated_on"),
        "joined_high_quality_footprints": proof.get("joined_high_quality_footprints"),
        "footprints": emitted,
        "default_shot": str(default_shot),
        "profiles_path": "profiles",
        "provenance": provenance,
    }
    return bundle, client_profiles


def manifest_for(bundle: dict[str, Any], input_path: Path, profile_count: int) -> dict[str, Any]:
    return {
        "schema_version": "forest-xray-client-v2",
        "status": "validated",
        "generated_from": str(input_path),
        "pilot": bundle["pilot"],
        "collection_version": bundle["collection_version"],
        "source_granules": {product: data["granule"] for product, data in bundle["provenance"]["products"].items()},
        "join_key": bundle["provenance"]["join_key"],
        "joined_high_quality_footprints": bundle["joined_high_quality_footprints"],
        "emitted_footprints": len(bundle["footprints"]),
        "exported_profiles": profile_count,
        "default_shot": bundle["default_shot"],
        "checks": {
            "three_product_shot_join": True,
            "quality_flags_pass": True,
            "profiles_per_footprint": profile_count == len(bundle["footprints"]),
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
        bundle, profiles = validate_proof(proof, args.limit)
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        print(f"validation failed: {exc}", file=sys.stderr)
        return 1
    manifest = manifest_for(bundle, args.input, len(profiles))
    if not args.check_only:
        write_json(args.output, bundle)
        write_json(args.manifest, manifest)
        args.profiles_dir.mkdir(parents=True, exist_ok=True)
        for shot_key, profile in profiles.items():
            write_json(args.profiles_dir / f"{shot_key}.json", profile)
    action = "validated" if args.check_only else (
        f"validated and wrote {args.output}, {args.manifest}, and {len(profiles)} profiles"
    )
    print(
        f"{action}: {bundle['joined_high_quality_footprints']} joined footprints, "
        f"{len(bundle['footprints'])} emitted, default shot {bundle['default_shot']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

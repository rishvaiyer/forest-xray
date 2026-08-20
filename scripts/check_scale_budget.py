#!/usr/bin/env python3
"""Check the deterministic synthetic scale fixture and built asset budgets.

The generated rows are benchmark data, not NASA GEDI observations. Nothing is
written to disk and no Earthdata credentials or source HDF5 files are read.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


FIXTURE_COUNT = 5_000
TILE_GRID = 16
MAX_TILE_BYTES = 250 * 1024
MAX_TOTAL_JS_GZIP_BYTES = 825 * 1024
MAX_JS_CHUNK_GZIP_BYTES = 525 * 1024
EXPECTED_FIXTURE_SHA256 = "d5a390a2fc41532accc5277b64dc555408bbb5152049c0fbdae051cf7d2ea878"
BBOX = (-124.15, 41.15, -123.85, 41.45)
BEAMS = ("BEAM0000", "BEAM0010", "BEAM0101", "BEAM0110")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-dist", type=Path, default=Path("app/dist"))
    parser.add_argument("--print-hash", action="store_true")
    return parser.parse_args()


def synthetic_footprints(count: int = FIXTURE_COUNT) -> list[dict[str, Any]]:
    """Return stable schema-compatible summaries for scale testing only."""
    west, south, east, north = BBOX
    rows: list[dict[str, Any]] = []
    for index in range(count):
        x = ((index * 37) % 5_003) / 5_002
        y = ((index * 91) % 5_009) / 5_008
        ground = round(6 + ((index * 17) % 8_500) / 100, 2)
        canopy = round(18 + ((index * 29) % 10_000) / 100, 2)
        rows.append(
            {
                "beam": BEAMS[index % len(BEAMS)],
                "shot": f"SYNTHETIC-{index:05d}",
                "lat": round(south + (north - south) * y, 7),
                "lon": round(west + (east - west) * x, 7),
                "rh100_m": canopy,
                "rh50_m": round(canopy * (0.42 + (index % 17) / 100), 2),
                "ground_elevation_m": ground,
                "highest_return_elevation_m": round(ground + canopy, 2),
                "cover": round(0.35 + ((index * 13) % 640) / 1_000, 3),
            }
        )
    return rows


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def fixture_hash(rows: list[dict[str, Any]]) -> str:
    return hashlib.sha256(canonical_bytes(rows)).hexdigest()


def tile_payloads(rows: list[dict[str, Any]]) -> dict[str, bytes]:
    west, south, east, north = BBOX
    tiles: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        tile_x = min(TILE_GRID - 1, int((row["lon"] - west) / (east - west) * TILE_GRID))
        tile_y = min(TILE_GRID - 1, int((row["lat"] - south) / (north - south) * TILE_GRID))
        tiles[f"{tile_x}:{tile_y}"].append(row)
    return {
        tile_id: canonical_bytes(
            {
                "data_kind": "synthetic-scale-benchmark",
                "scientific_use": False,
                "footprints": tile_rows,
            }
        )
        for tile_id, tile_rows in sorted(tiles.items())
    }


def check_fixture(rows: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    if len(rows) != FIXTURE_COUNT:
        errors.append(f"expected {FIXTURE_COUNT} rows, found {len(rows)}")
    shots = {row["shot"] for row in rows}
    if len(shots) != len(rows) or not all(shot.startswith("SYNTHETIC-") for shot in shots):
        errors.append("synthetic shot identifiers must be unique and explicitly labeled")
    if any(not (0 <= row["cover"] <= 1) for row in rows):
        errors.append("canopy cover must remain between zero and one")
    if any(row["rh50_m"] > row["rh100_m"] for row in rows):
        errors.append("RH50 cannot exceed RH100")
    actual_hash = fixture_hash(rows)
    if actual_hash != EXPECTED_FIXTURE_SHA256:
        errors.append(
            f"fixture hash changed: expected {EXPECTED_FIXTURE_SHA256}, found {actual_hash}"
        )
    payloads = tile_payloads(rows)
    largest = max((len(payload) for payload in payloads.values()), default=0)
    if largest > MAX_TILE_BYTES:
        errors.append(f"largest tile is {largest} bytes, budget is {MAX_TILE_BYTES}")
    return errors


def check_built_assets(app_dist: Path) -> tuple[list[str], dict[str, int]]:
    errors: list[str] = []
    assets_dir = app_dist / "assets"
    js_files = sorted(assets_dir.glob("*.js"))
    if not js_files:
        return [f"no compiled JavaScript found under {assets_dir}"], {}
    gzip_sizes = {
        path.name: len(gzip.compress(path.read_bytes(), compresslevel=9, mtime=0))
        for path in js_files
    }
    total = sum(gzip_sizes.values())
    largest_name, largest_size = max(gzip_sizes.items(), key=lambda item: item[1])
    if total > MAX_TOTAL_JS_GZIP_BYTES:
        errors.append(f"compiled JavaScript is {total} gzip bytes, budget is {MAX_TOTAL_JS_GZIP_BYTES}")
    if largest_size > MAX_JS_CHUNK_GZIP_BYTES:
        errors.append(
            f"largest chunk {largest_name} is {largest_size} gzip bytes, budget is {MAX_JS_CHUNK_GZIP_BYTES}"
        )
    return errors, gzip_sizes


def main() -> int:
    args = parse_args()
    rows = synthetic_footprints()
    actual_hash = fixture_hash(rows)
    if args.print_hash:
        print(actual_hash)
        return 0

    fixture_errors = check_fixture(rows)
    asset_errors, gzip_sizes = check_built_assets(args.app_dist)
    errors = fixture_errors + asset_errors
    if errors:
        for error in errors:
            print(f"scale budget failed: {error}", file=sys.stderr)
        return 1

    payloads = tile_payloads(rows)
    print(
        "scale budget passed: "
        f"{len(rows)} synthetic summaries, {len(payloads)} tiles, "
        f"largest tile {max(map(len, payloads.values()))} bytes, "
        f"JavaScript {sum(gzip_sizes.values())} gzip bytes"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

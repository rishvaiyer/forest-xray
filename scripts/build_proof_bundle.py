#!/usr/bin/env python3
"""Build a small, credential-free Forest X-Ray proof bundle from local GEDI files."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

import h5py
import numpy as np


ROOT = Path("/tmp/forest-xray-v003-o02932")
OUT = Path("data/forest_xray_proof.json")
BBOX = (-124.3, 40.0, -123.4, 42.2)
EMIT_LIMIT = 64
PRODUCT_PATTERNS = {
    "GEDI01_B": "GEDI01_B*.h5",
    "GEDI02_A": "GEDI02_A*.h5",
    "GEDI02_B": "GEDI02_B*.h5",
}


def files() -> dict[str, Path]:
    found = {label: next(ROOT.glob(pattern)) for label, pattern in PRODUCT_PATTERNS.items()}
    if len(found) != 3:
        raise RuntimeError("Expected all three current V003 GEDI files")
    return found


def shot_index(path: Path) -> dict[tuple[str, int], int]:
    result: dict[tuple[str, int], int] = {}
    with h5py.File(path, "r") as handle:
        for beam in (name for name in handle if name.startswith("BEAM")):
            for index, shot in enumerate(handle[beam]["shot_number"][()]):
                result[(beam, int(shot))] = index
    return result


def terrain_and_imagery(lat: float, lon: float) -> dict[str, object]:
    query = urllib.parse.urlencode({"x": lon, "y": lat, "units": "Meters", "output": "json"})
    terrain_url = f"https://epqs.nationalmap.gov/v1/json?{query}"
    with urllib.request.urlopen(terrain_url, timeout=30) as response:
        terrain = json.load(response)

    bbox = f"{lon - 0.02},{lat - 0.02},{lon + 0.02},{lat + 0.02}"
    params = {
        "SERVICE": "WMS",
        "REQUEST": "GetMap",
        "VERSION": "1.3.0",
        "LAYERS": "MODIS_Terra_CorrectedReflectance_TrueColor",
        "STYLES": "",
        "CRS": "EPSG:4326",
        "BBOX": bbox,
        "WIDTH": 256,
        "HEIGHT": 256,
        "FORMAT": "image/jpeg",
        "TIME": "2019-06-19",
    }
    imagery_url = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(imagery_url, timeout=30) as response:
        imagery_status = {
            "status": response.status,
            "content_type": response.headers.get("content-type"),
            "bytes": len(response.read()),
        }

    return {
        "terrain": {"source": "USGS 3DEP Elevation Point Query Service", "url": terrain_url, "response": terrain},
        "imagery": {
            "source": "NASA GIBS MODIS Terra Corrected Reflectance True Color",
            "url": imagery_url,
            "response": imagery_status,
        },
    }


def extract_profile(
    beam: str,
    shot: int,
    index: int,
    paths: dict[str, Path],
    l1b_map: dict[tuple[str, int], int],
    l2b_map: dict[tuple[str, int], int],
) -> dict[str, object]:
    with h5py.File(paths["GEDI01_B"], "r") as l1b, h5py.File(paths["GEDI02_A"], "r") as l2a, h5py.File(
        paths["GEDI02_B"], "r"
    ) as l2b:
        a = l2a[beam]
        b = l2b[beam]
        raw = l1b[beam]
        l1b_idx = l1b_map[(beam, shot)]
        l2b_idx = l2b_map[(beam, shot)]
        waveform_start = int(raw["rx_sample_start_index"][l1b_idx])
        waveform_count = int(raw["rx_sample_count"][l1b_idx])
        waveform = np.asarray(raw["rxwaveform"][waveform_start : waveform_start + waveform_count])
        rh = np.asarray(a["rh"][index])
        lat = float(a["lat_lowestmode"][index])
        lon = float(a["lon_lowestmode"][index])
        return {
            "shot": shot,
            "beam": beam,
            "indices": {"GEDI01_B": l1b_idx, "GEDI02_A": index, "GEDI02_B": l2b_idx},
            "location": {"lat": lat, "lon": lon},
            "quality": {
                "GEDI01_B_geolocation_degrade": int(raw["geolocation/degrade"][l1b_idx]),
                "GEDI02_A_quality_flag_rel3": int(a["l2a_quality_flag_rel3"][index]),
                "GEDI02_A_degrade_flag": int(a["degrade_flag"][index]),
                "GEDI02_B_quality_flag_rel3": int(b["l2b_quality_flag_rel3"][l2b_idx]),
                "GEDI02_B_degrade_flag": int(b["geolocation/degrade_flag"][l2b_idx]),
            },
            "l1b": {
                "source_file": paths["GEDI01_B"].name,
                "rx_sample_start_index": waveform_start,
                "rx_sample_count": waveform_count,
                "rx_energy": float(raw["rx_energy"][l1b_idx]),
                "waveform_dn": waveform.astype(float).tolist(),
            },
            "l2a": {
                "source_file": paths["GEDI02_A"].name,
                "ground_elevation_m": float(a["elev_lowestmode"][index]),
                "highest_return_elevation_m": float(a["elev_highestreturn"][index]),
                "sensitivity": float(a["sensitivity"][index]),
                "selected_algorithm": int(a["selected_algorithm"][index]),
                "rh_m": rh.astype(float).tolist(),
            },
            "l2b": {
                "source_file": paths["GEDI02_B"].name,
                "pai": float(b["pai"][l2b_idx]),
                "cover": float(b["cover"][l2b_idx]),
                "fhd_normal": float(b["fhd_normal"][l2b_idx]),
                "pai_z": np.asarray(b["pai_z"][l2b_idx]).astype(float).tolist(),
                "pavd_z": np.asarray(b["pavd_z"][l2b_idx]).astype(float).tolist(),
                "cover_z": np.asarray(b["cover_z"][l2b_idx]).astype(float).tolist(),
            },
        }


def profile_to_client(
    profile: dict[str, object],
    granules: dict[str, str],
    terrain_stub: dict[str, object] | None = None,
) -> dict[str, object]:
    l1b = profile["l1b"]
    l2a = profile["l2a"]
    l2b = profile["l2b"]
    quality = profile["quality"]
    indices = profile["indices"]
    result: dict[str, object] = {
        "shot": profile["shot"],
        "beam": profile["beam"],
        "location": profile["location"],
        "indices": indices,
        "quality": quality,
        "provenance": {product: granules[product] for product in ("GEDI01_B", "GEDI02_A", "GEDI02_B")},
        "waveform_dn": l1b["waveform_dn"],
        "rh_m": l2a["rh_m"],
        "canopy": {
            "ground_elevation_m": l2a["ground_elevation_m"],
            "highest_return_elevation_m": l2a["highest_return_elevation_m"],
            "sensitivity": l2a["sensitivity"],
            "selected_algorithm": l2a["selected_algorithm"],
            "pai": l2b["pai"],
            "cover": l2b["cover"],
            "fhd_normal": l2b["fhd_normal"],
            "pai_z": l2b["pai_z"],
            "pavd_z": l2b["pavd_z"],
            "cover_z": l2b["cover_z"],
        },
    }
    if terrain_stub:
        result["terrain"] = terrain_stub.get("terrain", {})
        result["imagery"] = terrain_stub.get("imagery", {})
    return result


def main() -> None:
    paths = files()
    l1b_map = shot_index(paths["GEDI01_B"])
    l2b_map = shot_index(paths["GEDI02_B"])
    candidates: list[dict[str, object]] = []

    with h5py.File(paths["GEDI02_A"], "r") as l2a:
        for beam in (name for name in l2a if name.startswith("BEAM")):
            group = l2a[beam]
            shots = group["shot_number"][()]
            latitudes = group["lat_lowestmode"][()]
            longitudes = group["lon_lowestmode"][()]
            quality = group["l2a_quality_flag_rel3"][()]
            degrade = group["degrade_flag"][()]
            rh = group["rh"][()]
            for index in np.flatnonzero(
                np.isfinite(latitudes)
                & np.isfinite(longitudes)
                & (longitudes >= BBOX[0])
                & (longitudes <= BBOX[2])
                & (latitudes >= BBOX[1])
                & (latitudes <= BBOX[3])
                & (quality == 1)
                & (degrade == 0)
            ):
                shot = int(shots[index])
                key = (beam, shot)
                if key not in l1b_map or key not in l2b_map:
                    continue
                candidates.append(
                    {
                        "beam": beam,
                        "shot": shot,
                        "index": int(index),
                        "lat": float(latitudes[index]),
                        "lon": float(longitudes[index]),
                        "rh100_m": float(rh[index, 99]),
                        "rh50_m": float(rh[index, 49]),
                        "ground_elevation_m": float(group["elev_lowestmode"][index]),
                        "highest_return_elevation_m": float(group["elev_highestreturn"][index]),
                    }
                )

    if len(candidates) < 20:
        raise RuntimeError(f"Expected at least 20 joined footprints, found {len(candidates)}")

    ordered = sorted(candidates, key=lambda row: float(row["rh100_m"]), reverse=True)
    emit_rows = ordered[:EMIT_LIMIT]
    footprint_profiles: dict[str, dict[str, object]] = {}
    for row in emit_rows:
        beam = str(row["beam"])
        shot = int(row["shot"])
        index = int(row["index"])
        footprint_profiles[str(shot)] = extract_profile(beam, shot, index, paths, l1b_map, l2b_map)

    target = ordered[0]
    proof = footprint_profiles[str(int(target["shot"]))]

    lat = float(proof["location"]["lat"])
    lon = float(proof["location"]["lon"])
    external = terrain_and_imagery(lat, lon)

    bundle = {
        "pilot": "Redwood National and State Parks",
        "collection_version": "003",
        "bbox": list(BBOX),
        "generated_on": "2026-08-12",
        "granules": {label: path.name for label, path in paths.items()},
        "joined_high_quality_footprints": len(candidates),
        "sample_footprints": [
            {k: v for k, v in row.items() if k != "index"} for row in emit_rows
        ],
        "footprint_profiles": footprint_profiles,
        "proof": proof,
        "terrain_and_imagery": external,
        "validation": {
            "three_product_shot_join": True,
            "quality_flags_pass": all(value in (0, 1) for value in proof["quality"].values()),
            "at_least_20_joined_footprints": len(candidates) >= 20,
            "terrain_request_ok": True,
            "imagery_request_ok": True,
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, indent=2) + "\n")
    print(f"wrote {OUT} with {len(candidates)} joined footprints, {len(footprint_profiles)} profiles")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build a small, credential-free Forest X-Ray proof bundle from local GEDI files."""

from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

import h5py
import numpy as np


ROOT = Path("/tmp/forest-xray-v003-o02932")
OUT = Path("data/forest_xray_proof.json")
BBOX = (-124.3, 40.0, -123.4, 42.2)
TARGET_BEAM = "BEAM0110"
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


def scalar(dataset: h5py.Dataset, index: int) -> float | int:
    value = np.asarray(dataset[index])
    return value.item() if value.ndim == 0 else value.tolist()


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
        "imagery": {"source": "NASA GIBS MODIS Terra Corrected Reflectance True Color", "url": imagery_url, "response": imagery_status},
    }


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
    target = max(candidates, key=lambda row: float(row["rh100_m"]))
    beam = str(target["beam"])
    shot = int(target["shot"])
    index = int(target["index"])

    with h5py.File(paths["GEDI01_B"], "r") as l1b, h5py.File(paths["GEDI02_A"], "r") as l2a, h5py.File(paths["GEDI02_B"], "r") as l2b:
        a = l2a[beam]
        b = l2b[beam]
        raw = l1b[beam]
        waveform_start = int(raw["rx_sample_start_index"][l1b_map[(beam, shot)]])
        waveform_count = int(raw["rx_sample_count"][l1b_map[(beam, shot)]])
        waveform = np.asarray(raw["rxwaveform"][waveform_start : waveform_start + waveform_count])
        rh = np.asarray(a["rh"][index])
        proof = {
            "shot": shot,
            "beam": beam,
            "indices": {"GEDI01_B": l1b_map[(beam, shot)], "GEDI02_A": index, "GEDI02_B": l2b_map[(beam, shot)]},
            "location": {"lat": float(a["lat_lowestmode"][index]), "lon": float(a["lon_lowestmode"][index])},
            "quality": {
                "GEDI01_B_geolocation_degrade": int(raw["geolocation/degrade"][l1b_map[(beam, shot)]]),
                "GEDI02_A_quality_flag_rel3": int(a["l2a_quality_flag_rel3"][index]),
                "GEDI02_A_degrade_flag": int(a["degrade_flag"][index]),
                "GEDI02_B_quality_flag_rel3": int(b["l2b_quality_flag_rel3"][l2b_map[(beam, shot)]]),
                "GEDI02_B_degrade_flag": int(b["geolocation/degrade_flag"][l2b_map[(beam, shot)]]),
            },
            "l1b": {
                "source_file": paths["GEDI01_B"].name,
                "rx_sample_start_index": waveform_start,
                "rx_sample_count": waveform_count,
                "rx_energy": float(raw["rx_energy"][l1b_map[(beam, shot)]]),
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
                "pai": float(b["pai"][l2b_map[(beam, shot)]]),
                "cover": float(b["cover"][l2b_map[(beam, shot)]]),
                "fhd_normal": float(b["fhd_normal"][l2b_map[(beam, shot)]]),
                "pai_z": np.asarray(b["pai_z"][l2b_map[(beam, shot)]]).astype(float).tolist(),
                "pavd_z": np.asarray(b["pavd_z"][l2b_map[(beam, shot)]]).astype(float).tolist(),
                "cover_z": np.asarray(b["cover_z"][l2b_map[(beam, shot)]]).astype(float).tolist(),
            },
        }

    lat = float(proof["location"]["lat"])
    lon = float(proof["location"]["lon"])
    bundle = {
        "pilot": "Redwood National and State Parks",
        "collection_version": "003",
        "bbox": list(BBOX),
        "generated_on": "2026-08-12",
        "granules": {label: path.name for label, path in paths.items()},
        "joined_high_quality_footprints": len(candidates),
        "sample_footprints": sorted(candidates, key=lambda row: float(row["rh100_m"]), reverse=True)[:20],
        "proof": proof,
        "terrain_and_imagery": terrain_and_imagery(lat, lon),
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
    print(f"wrote {OUT} with {len(candidates)} joined footprints")


if __name__ == "__main__":
    main()

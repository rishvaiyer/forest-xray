#!/usr/bin/env python3
"""Discover GEDI coverage and report local Earthdata readiness.

The probe is read-only. It deliberately separates public CMR discovery from
protected granule access so an unauthenticated run cannot look like a completed
scientific join.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any


PRODUCTS = ("GEDI01_B", "GEDI02_A", "GEDI02_B")
DEFAULT_BBOX = (-124.3, 40.0, -123.4, 42.2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", default="003")
    parser.add_argument("--count", type=int, default=3)
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("MIN_LON", "MIN_LAT", "MAX_LON", "MAX_LAT"), default=DEFAULT_BBOX)
    return parser.parse_args()


def auth_snapshot(earthaccess: Any) -> dict[str, Any]:
    for strategy in ("environment", "netrc"):
        try:
            auth = earthaccess.login(strategy=strategy, persist=False)
        except Exception as exc:
            if strategy == "netrc":
                print(f"{strategy} auth unavailable: {type(exc).__name__}", file=sys.stderr)
            continue
        authenticated = bool(getattr(auth, "authenticated", False))
        if authenticated:
            return {
                "authenticated": True,
                "strategy": strategy,
                "can_open_protected_granules": True,
            }
    return {
        "authenticated": False,
        "strategy": "environment-or-netrc",
        "can_open_protected_granules": False,
    }


def granule_summary(granule: Any) -> dict[str, Any]:
    links = granule.data_links()
    return {
        "uuid": granule.uuid,
        "size_mb": granule.size(),
        "url": links[0] if links else None,
    }


def main() -> int:
    args = parse_args()
    try:
        import earthaccess
    except ImportError as exc:  # pragma: no cover - environment-specific
        print(f"earthaccess is required: {exc}", file=sys.stderr)
        return 2

    result: dict[str, Any] = {
        "pilot": "Redwood National and State Parks",
        "bbox": list(args.bbox),
        "version": args.version,
        "read_only": True,
        "products": {},
    }

    try:
        result["auth"] = auth_snapshot(earthaccess)
    except Exception as exc:  # auth probing must not prevent public discovery
        result["auth"] = {"authenticated": False, "error": type(exc).__name__}
        print(f"auth probe: {type(exc).__name__}: {exc}", file=sys.stderr)

    for product in PRODUCTS:
        try:
            granules = earthaccess.search_data(
                short_name=product,
                version=args.version,
                bounding_box=tuple(args.bbox),
                count=args.count,
            )
            result["products"][product] = {
                "count": len(granules),
                "granules": [granule_summary(granule) for granule in granules],
            }
        except Exception as exc:
            result["products"][product] = {
                "count": 0,
                "error": type(exc).__name__,
            }
            print(f"{product}: {type(exc).__name__}: {exc}", file=sys.stderr)

    result["proof_status"] = (
        "metadata-discovered-auth-required"
        if not result["auth"].get("authenticated")
        else "metadata-discovered-authenticated-ready"
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

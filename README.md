# Forest X-Ray

Phase 0 data-proof harness for the Redwood National and State Parks pilot.

This is intentionally data-first. It discovers current GEDI granules without
credentials and reports whether a local Earthdata session is available. It does
not download protected files, store credentials, or claim a joined footprint
until authenticated HDF5 inputs are present.

## Run

```bash
/tmp/forest-xray-venv/bin/python scripts/forest_xray_probe.py
```

The command emits JSON on stdout and diagnostics on stderr. Once Earthdata
authentication is configured locally, the same probe is the entry point for the
minimal V003 L1B/L2A/L2B subset and join check.

## Current proof bundle

After authenticating, the Phase 0 download and bundle build are:

```bash
/tmp/forest-xray-venv/bin/python scripts/build_proof_bundle.py
```

This writes `data/forest_xray_proof.json` from the three local V003 granules.
The source HDF5 files remain outside the project under `/tmp`; credentials are
not included.

## Local interface

```bash
cd app
npm install --no-audit --no-fund
npm run dev
```

Open the printed localhost URL. The interface is a static local proof surface:
select a footprint, inspect its waveform and vertical canopy-cover profile, and
follow the NASA/USGS provenance links. It does not call Earthdata from the
browser and does not include credentials.

For a kid-friendly explanation of every result, see
[`docs/using-forest-xray.md`](docs/using-forest-xray.md).

## Phase 1 verification

```bash
python3 scripts/validate_forest_xray_bundle.py --check-only
cd app && npm run build
```

The validator confirms the current V003 three-product join and emits a compact
20-footprint client bundle. The Vite build produces a local static app. No
deployment has been made.

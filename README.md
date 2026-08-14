# Forest X-Ray

[![Deploy GitHub Pages](https://github.com/rishvaiyer/forest-xray/actions/workflows/pages.yml/badge.svg)](https://github.com/rishvaiyer/forest-xray/actions/workflows/pages.yml)

An interactive NASA GEDI forest-canopy explorer for Redwood National and State
Parks. Forest X-Ray turns joined waveform, relative-height, and canopy-structure
measurements into a footprint map, vertical canopy view, comparison tool, and
historical fire replay.

**[Open the live explorer](https://rishvaiyer.github.io/forest-xray/)**

## What you can explore

- Select glowing GEDI footprints on a MapLibre 3D terrain map.
- Inspect each footprint's waveform, RH50/RH100 heights, canopy cover, and
  ground elevation.
- View the return as an interactive Three.js canopy "x-ray."
- Compare two footprints with deterministic, non-AI summaries.
- Replay a historical Slater Fire example with clear before/during/after
  context.
- Share a selected footprint or mode directly from the URL.

## How it works

Forest X-Ray is a static application: an offline Python pipeline joins NASA
GEDI V003 L1B, L2A, and L2B products, validates the result, and exports compact
JSON for the Vite/React client. The browser never receives Earthdata
credentials and does not call protected NASA services.

```text
GEDI HDF5 products → Python join/validation → static JSON → React explorer
```

The checked-in proof bundle contains up to 64 high-quality joined footprints.
Waveforms are lazy-loaded from `data/profiles/` so the initial client index
stays small.

## Run locally

```bash
cd app
npm ci
npm run dev
```

Open the localhost URL printed by Vite.

## Verify

```bash
python3 scripts/validate_forest_xray_bundle.py --check-only
cd app
npm test
npm run build
```

Every push to `main` runs the tests, builds the static app, and deploys it to
GitHub Pages.

## Rebuild the proof data

Rebuilding requires authenticated local GEDI HDF5 inputs and Python with
`h5py` and `numpy`:

```bash
python3 scripts/forest_xray_probe.py
python3 scripts/build_proof_bundle.py
python3 scripts/validate_forest_xray_bundle.py
python3 scripts/build_fire_replay_bundle.py
```

The source HDF5 files and Earthdata credentials stay outside the repository.

## Scope and limitations

This is a scientific footprint visualization, not a photograph, an
individual-tree reconstruction, a live fire feed, or a fire predictor. The fire
replay is a simplified historical demonstration.

See [`docs/using-forest-xray.md`](docs/using-forest-xray.md) for a plain-language
guide to the measurements and interface.

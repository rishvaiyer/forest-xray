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
python3 scripts/validate_forest_xray_bundle.py
python3 scripts/build_fire_replay_bundle.py
```

This writes `data/forest_xray_proof.json` from the three local V003 granules,
exports `data/forest_xray_client.json` plus per-shot profiles under
`data/profiles/`, and builds `data/fire_replay.json` for the fire-impact demo.
The source HDF5 files remain outside the project under `/tmp`; credentials are
not included.

## Local interface

```bash
cd app
npm install --no-audit --no-fund
npm run dev
```

Open the printed localhost URL. The React interface includes:

- MapLibre 3D terrain with deck.gl footprint columns (click to select)
- Per-footprint lazy-loaded waveform and canopy profiles (`data/profiles/{shot}.json`)
- Three.js x-ray chamber for the selected return
- Shareable URLs via `?shot=<id>` and modes `?mode=compare` / `?mode=fire`
- Two-footprint compare mode with deterministic summaries
- Fire Impact Replay (historical Slater Fire demo, not a live predictor)

It does not call Earthdata from the browser and does not include credentials.

For a kid-friendly explanation of every result, see
[`docs/using-forest-xray.md`](docs/using-forest-xray.md).

## Verification

```bash
python3 scripts/validate_forest_xray_bundle.py --check-only
cd app && npm test && npm run build
```

The validator confirms the current V003 three-product join and emits a compact
client index with up to 64 lazy-loaded footprint profiles. The Vite build
produces a local static app with the full `data/` tree copied into `dist/`. No
deployment has been made.

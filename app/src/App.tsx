import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadClientIndex,
  loadFireReplay,
  loadProfile,
  modeFromUrl,
  shareUrl,
  shotFromUrl,
  updateUrl,
} from './data/loadFootprint';
import type { ClientIndex, FireReplayBundle, FootprintProfile } from './types';
import { fmt, ProfileChart, WaveformChart } from './charts/Charts';
import { ComparePanel } from './compare/ComparePanel';
import { FireReplayPanel } from './fire/FireReplayPanel';

const ForestMap = lazy(() => import('./map/ForestMap').then((m) => ({ default: m.ForestMap })));
const XRayChamber = lazy(() => import('./xray/XRayChamber').then((m) => ({ default: m.XRayChamber })));

function deploymentLabel() {
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
    return 'GitHub Pages';
  }
  if (import.meta.env.BASE_URL !== '/') return 'GitHub Pages';
  return 'Local proof';
}

function Metric({ label, value, suffix, accent = '' }: { label: string; value: string; suffix: string; accent?: string }) {
  return (
    <div className={`metric ${accent}`}>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="metric-suffix">{suffix}</span>
    </div>
  );
}

export default function App() {
  const [index, setIndex] = useState<ClientIndex | null>(null);
  const [fireReplay, setFireReplay] = useState<FireReplayBundle | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [mode, setMode] = useState<'scan' | 'compare' | 'fire'>(modeFromUrl());
  const [selectedShot, setSelectedShot] = useState<string | null>(shotFromUrl());
  const [profile, setProfile] = useState<FootprintProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [absoluteScale, setAbsoluteScale] = useState(false);
  const [fireStop, setFireStop] = useState('before');
  const [copyLabel, setCopyLabel] = useState('Copy link');
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    Promise.all([loadClientIndex(), loadFireReplay()])
      .then(([clientIndex, fire]) => {
        setIndex(clientIndex);
        setFireReplay(fire);
        const shot = shotFromUrl() ?? clientIndex.default_shot;
        setSelectedShot(shot);
        const pair = clientIndex.story_pairs?.[0];
        setCompareA(pair?.shot_a ?? clientIndex.footprints[0]?.shot ?? shot);
        setCompareB(pair?.shot_b ?? clientIndex.footprints[1]?.shot ?? shot);
      })
      .catch((e: Error) => setBootError(e.message));
  }, []);

  const selected = useMemo(() => {
    if (!index || selectedShot === null) return null;
    return index.footprints.find((f) => f.shot === selectedShot) ?? index.footprints[0];
  }, [index, selectedShot]);

  const selectShot = useCallback((shot: string) => {
    setSelectedShot(shot);
    updateUrl(shot, mode);
  }, [mode]);

  useEffect(() => {
    if (selectedShot === null) return;
    setLoading(true);
    setError(null);
    loadProfile(selectedShot)
      .then(setProfile)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedShot]);

  const handleCopy = async () => {
    if (selectedShot === null) return;
    try {
      await navigator.clipboard.writeText(shareUrl(selectedShot, mode));
      setCopyLabel('Copied');
      setTimeout(() => setCopyLabel('Copy link'), 1200);
    } catch {
      setCopyLabel(shareUrl(selectedShot, mode).slice(-24));
    }
  };

  if (bootError) {
    return (
      <div className="boot-error">
        <p className="status-text error">Could not load the scan bundle: {bootError}</p>
      </div>
    );
  }

  if (!index || !fireReplay || selectedShot === null || !selected || compareA === null || compareB === null) {
    return (
      <div className="boot-screen">
        <div className="boot-mark">Forest X-Ray</div>
        <p>Listening for the echo…</p>
      </div>
    );
  }

  const coverPct = (profile?.canopy.cover ?? selected.cover) * 100;
  const rh50Share = selected.rh100_m > 0 ? Math.min(90, Math.max(12, (selected.rh50_m / selected.rh100_m) * 100)) : 50;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <strong>Forest X-Ray</strong>
          <small>Redwood National & State Parks</small>
        </div>
        <nav className="mode-nav" aria-label="View mode">
          {([
            ['scan', 'Scan'],
            ['compare', 'Compare'],
            ['fire', 'Fire replay'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`mode-button ${mode === id ? 'is-active' : ''}`}
              onClick={() => {
                setMode(id);
                updateUrl(selectedShot, id);
                if (id === 'fire') selectShot(fireReplay.gedi_shot);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="header-meta">
          <span className="live-dot" />
          <span>{deploymentLabel()}</span>
          <span className="version-chip">GEDI v{index.collection_version}</span>
        </div>
      </header>

      <section className="lede">
        <h1>Click a pulse from space. Watch the forest stack itself.</h1>
        <p>
          Each glowing column is one 25-meter laser footprint. The echo becomes height, cover, and ground — not a photograph of individual trees.
        </p>
      </section>

      <section className="look-strip" aria-label="How to look">
        <article className="look-item">
          <strong>Pick a column</strong>
          <p>One ISS laser pulse, about 25 m across, sampled along an orbital track.</p>
        </article>
        <article className="look-item">
          <strong>Follow the echo</strong>
          <p>The waveform is returned energy. Bigger bumps mean more bounce at that height.</p>
        </article>
        <article className="look-item">
          <strong>Read the ticks</strong>
          <p>RH100 is the top return. RH50 is the energy midpoint. Cover is how leafy the circle looks.</p>
        </article>
      </section>

      <main className={`stage ${mode === 'scan' ? 'is-split' : 'is-wide'}`}>
        <section className="panel map-panel">
          <div className="panel-head">
            <div>
              <span className="kicker">Orbital sweep</span>
              <h2>Footprint field</h2>
            </div>
            <span className="panel-count">{index.joined_high_quality_footprints.toLocaleString()} joined returns</span>
          </div>
          <Suspense fallback={<p className="status-text">Loading terrain map…</p>}>
            <ForestMap
              bbox={index.bbox}
              footprints={index.footprints}
              selectedShot={selectedShot}
              firePerimeter={mode === 'fire' ? fireReplay.perimeter : null}
              fireOpacity={fireStop === 'before' ? 0.08 : fireStop === 'during' ? 0.35 : 0.22}
              onSelect={selectShot}
              readoutRh100={selected.rh100_m}
            />
          </Suspense>
          <div className="map-legend">
            <span className="legend-dot selected" />
            <span>selected</span>
            <span className="legend-dot" />
            <span>taller canopy</span>
            <span className="legend-dot short" />
            <span>shorter canopy</span>
            <span className="map-note">25 m footprint · MapLibre terrain</span>
          </div>
        </section>

        {mode === 'scan' && (
          <section className="panel xray-panel">
            <div className="panel-head">
              <div>
                <span className="kicker">Selected return</span>
                <h2>Canopy x-ray</h2>
              </div>
              <button type="button" className="ghost-button" onClick={handleCopy}>{copyLabel}</button>
            </div>
            <div className="identity">
              <div className="beam-tag">{selected.beam}</div>
              <div className="shot-id">{selected.shot}</div>
              <div className="coordinates">{fmt(selected.lat, 5)}° N · {fmt(Math.abs(selected.lon), 5)}° W</div>
            </div>
            <div className="metric-grid">
              <Metric label="RH100" value={fmt(selected.rh100_m)} suffix="m" accent="lime" />
              <Metric label="RH50" value={fmt(selected.rh50_m)} suffix="m" />
              <Metric label="Cover" value={fmt(coverPct)} suffix="%" accent="amber" />
              <Metric label="Ground" value={fmt(profile?.canopy.ground_elevation_m ?? selected.ground_elevation_m)} suffix="m" />
            </div>
            {loading && <p className="status-text">Loading waveform…</p>}
            {error && <p className="status-text error">{error}</p>}
            {profile && (
              <>
                <div className="xray-stage">
                  <div className="height-rail" aria-hidden="true">
                    <span className="rail-tick top">RH100 {fmt(selected.rh100_m, 0)} m</span>
                    <span className="rail-tick mid" style={{ bottom: `${rh50Share}%` }}>RH50 {fmt(selected.rh50_m, 0)} m</span>
                    <span className="rail-tick ground">ground</span>
                  </div>
                  <Suspense fallback={<p className="status-text">Loading x-ray…</p>}>
                    <XRayChamber profile={profile} reducedMotion={reducedMotion} />
                  </Suspense>
                </div>
                <div className="chart-section">
                  <div className="chart-title"><span>Returned energy</span><span>{profile.waveform_dn.length.toLocaleString()} bins</span></div>
                  <WaveformChart values={profile.waveform_dn} />
                </div>
                <div className="chart-section">
                  <div className="chart-title"><span>Canopy cover profile</span><span>top → ground</span></div>
                  <ProfileChart coverZ={profile.canopy.cover_z} groundElevation={profile.canopy.ground_elevation_m} highestReturn={profile.canopy.highest_return_elevation_m} />
                </div>
              </>
            )}
          </section>
        )}
      </main>

      {mode === 'compare' && (
        <ComparePanel
          footprints={index.footprints}
          shotA={compareA}
          shotB={compareB}
          absoluteScale={absoluteScale}
          onShotA={setCompareA}
          onShotB={setCompareB}
          onToggleScale={() => setAbsoluteScale((v) => !v)}
          storyPairs={index.story_pairs}
        />
      )}

      {mode === 'fire' && <FireReplayPanel bundle={fireReplay} onTimelineChange={setFireStop} />}

      <section className="provenance panel">
        <div>
          <span className="kicker">Traceability</span>
          <h2>What this scan is</h2>
        </div>
        <p>Joined GEDI Level 1B waveform, Level 2A relative heights, and Level 2B canopy structure. A scientific footprint visualization, not a reconstruction of individual trees, and not a live fire tool.</p>
        <div className="source-list">
          <a href="https://gedi.umd.edu/dataproducts/products/" target="_blank" rel="noreferrer">NASA GEDI products</a>
          <a href="https://epqs.nationalmap.gov/v1/docs" target="_blank" rel="noreferrer">USGS 3DEP terrain</a>
          <a href="https://nasa-gibs.github.io/gibs-api-docs/access-basics/" target="_blank" rel="noreferrer">NASA GIBS imagery</a>
        </div>
      </section>

      <footer className="footer">
        <span>Proof captured {index.generated_on}</span>
        <span>No backend · static NASA-derived fixture</span>
      </footer>
    </>
  );
}

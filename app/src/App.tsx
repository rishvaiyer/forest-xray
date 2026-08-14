import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  compareFromUrl,
  loadClientIndex,
  loadFireReplay,
  loadProfile,
  modeFromUrl,
  shareUrl,
  shotFromUrl,
  updateUrl,
} from './data/loadFootprint';
import { acquiredFromGranule, describeQuality, heightInStories, leafyLabel, neighborShots, trackOrder } from './data/track';
import type { ClientIndex, FireReplayBundle, FootprintProfile, FootprintSummary } from './types';
import { fmt, ProfileChart, WaveformChart } from './charts/Charts';
import { ForestStack } from './charts/ForestStack';
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

function Metric({ label, hint, value, suffix, accent = '' }: { label: string; hint: string; value: string; suffix: string; accent?: string }) {
  return (
    <div className={`metric ${accent}`}>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="metric-suffix">{suffix}</span>
      <span className="metric-hint">{hint}</span>
    </div>
  );
}

function sortedShots(footprints: FootprintSummary[], sort: 'height' | 'cover' | 'ground') {
  return [...footprints].sort((a, b) => {
    if (sort === 'cover') return b.cover - a.cover;
    if (sort === 'ground') return a.ground_elevation_m - b.ground_elevation_m;
    return b.rh100_m - a.rh100_m;
  });
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
  const [inspectT, setInspectT] = useState<number | null>(null);
  const [listSort, setListSort] = useState<'height' | 'cover' | 'ground'>('height');
  const [pulseKey, setPulseKey] = useState(0);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    Promise.all([loadClientIndex(), loadFireReplay()])
      .then(([clientIndex, fire]) => {
        setIndex(clientIndex);
        setFireReplay(fire);
        const shot = shotFromUrl() ?? clientIndex.default_shot;
        setSelectedShot(shot);
        const fromUrl = compareFromUrl();
        const pair = clientIndex.story_pairs?.[0];
        setCompareA(fromUrl.a ?? pair?.shot_a ?? clientIndex.footprints[0]?.shot ?? shot);
        setCompareB(fromUrl.b ?? pair?.shot_b ?? clientIndex.footprints[1]?.shot ?? shot);
      })
      .catch((e: Error) => setBootError(e.message));
  }, []);

  const selected = useMemo(() => {
    if (!index || selectedShot === null) return null;
    return index.footprints.find((f) => f.shot === selectedShot) ?? index.footprints[0];
  }, [index, selectedShot]);

  const order = useMemo(() => (index ? trackOrder(index.footprints) : []), [index]);
  const neighbors = selectedShot ? neighborShots(order, selectedShot) : { index: -1, prev: null, next: null };

  const selectShot = useCallback((shot: string, nextMode = mode) => {
    setSelectedShot(shot);
    setInspectT(null);
    setPulseKey((n) => n + 1);
    updateUrl(shot, nextMode, nextMode === 'compare' && compareA && compareB ? { a: compareA, b: compareB } : undefined);
  }, [mode, compareA, compareB]);

  useEffect(() => {
    if (selectedShot === null) return;
    setLoading(true);
    setError(null);
    loadProfile(selectedShot)
      .then(setProfile)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedShot]);

  useEffect(() => {
    if (mode !== 'compare' || !selectedShot || !compareA || !compareB) return;
    updateUrl(selectedShot, 'compare', { a: compareA, b: compareB });
  }, [compareA, compareB, mode, selectedShot]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'j' && neighbors.next) selectShot(neighbors.next);
      if (event.key === 'k' && neighbors.prev) selectShot(neighbors.prev);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [neighbors.next, neighbors.prev, selectShot]);

  const handleCopy = async () => {
    if (selectedShot === null) return;
    try {
      await navigator.clipboard.writeText(
        shareUrl(selectedShot, mode, mode === 'compare' && compareA && compareB ? { a: compareA, b: compareB } : undefined),
      );
      setCopyLabel('Copied');
      setTimeout(() => setCopyLabel('Copy link'), 1200);
    } catch {
      setCopyLabel('Copy failed');
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
  const stories = heightInStories(selected.rh100_m);
  const acquired = acquiredFromGranule(index.provenance.products.GEDI01_B?.granule);
  const inspectMeters = inspectT == null ? null : inspectT * selected.rh100_m;
  const coverAtInspect = (() => {
    if (inspectT == null || !profile) return null;
    const layers = profile.canopy.cover_z;
    const indexFromTop = Math.round((1 - inspectT) * (layers.length - 1));
    return layers[indexFromTop] * 100;
  })();

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
                if (id === 'fire') selectShot(fireReplay.gedi_shot, id);
                else selectShot(selectedShot, id);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="header-meta">
          <span className="live-dot" />
          <span>{deploymentLabel()}</span>
          <span className="version-chip">{acquired ?? 'GEDI v003'}</span>
        </div>
      </header>

      <section className="lede">
        <p>
          Click a glowing column. You are looking at one 25-meter circle — about a tennis court — not a single tree. The layers you see are real laser returns from the International Space Station.
        </p>
      </section>

      <section className="look-strip" aria-label="How to look">
        <article className="look-item">
          <strong>The column is a spotlight</strong>
          <p>NASA’s GEDI lidar sent a pulse down. Each column is where it hit.</p>
        </article>
        <article className="look-item">
          <strong>The stack is the forest</strong>
          <p>Wide layers mean more leaves. The top number is the highest bounce.</p>
        </article>
        <article className="look-item">
          <strong>The squiggle is the echo</strong>
          <p>Bigger bumps mean more laser energy came back. Hover the leafy chart to peek inside a height.</p>
        </article>
      </section>

      <main className={`stage ${mode === 'scan' ? 'is-split' : 'is-wide'}`}>
        <section className="panel map-panel">
          <div className="panel-head">
            <div>
              <span className="kicker">On the ground</span>
              <h2>Where the pulse landed</h2>
            </div>
            <div className="track-nav">
              <button type="button" className="ghost-button" disabled={!neighbors.prev} onClick={() => neighbors.prev && selectShot(neighbors.prev)}>Previous</button>
              <button type="button" className="ghost-button" disabled={!neighbors.next} onClick={() => neighbors.next && selectShot(neighbors.next)}>Next along track</button>
            </div>
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
              readoutCover={coverPct}
              readoutStories={stories}
            />
          </Suspense>
          <div className="map-legend">
            <span className="legend-dot selected" />
            <span>the one you picked</span>
            <span className="legend-dot" />
            <span>taller</span>
            <span className="legend-dot short" />
            <span>shorter</span>
            <span className="map-note">j / k walks the orbit · 25 m spotlight</span>
          </div>
          <div className="shot-list-head">
            <span className="kicker">All {index.footprints.length} pulses</span>
            <div className="sort-pills" role="group" aria-label="Sort pulses">
              {([
                ['height', 'Tallest'],
                ['cover', 'Leafiest'],
                ['ground', 'Lowest ground'],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" className={`sort-pill ${listSort === id ? 'is-active' : ''}`} onClick={() => setListSort(id)}>{label}</button>
              ))}
            </div>
          </div>
          <ul className="shot-list">
            {sortedShots(index.footprints, listSort).map((row) => (
              <li key={row.shot}>
                <button type="button" className={row.shot === selectedShot ? 'is-active' : ''} onClick={() => selectShot(row.shot)}>
                  <span className="shot-list-title">{fmt(row.rh100_m, 0)} m · {leafyLabel(row.cover)}</span>
                  <span className="shot-list-meta">{row.beam} · {fmt(row.cover * 100, 0)}% leafy</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {mode === 'scan' && (
          <section className="panel xray-panel">
            <div className="panel-head">
              <div>
                <span className="kicker">Inside the spotlight</span>
                <h2>How this patch of forest is stacked</h2>
              </div>
              <button type="button" className="ghost-button" onClick={handleCopy}>{copyLabel}</button>
            </div>
            <p className="plain-story">
              The highest bounce is about {fmt(selected.rh100_m, 0)} meters up — roughly a {stories}-story building.
              {' '}{leafyLabel(selected.cover)}. This is still one 25-meter circle, not a portrait of one redwood.
            </p>
            <div className="metric-grid">
              <Metric label="Canopy top" hint="highest bounce · RH100" value={fmt(selected.rh100_m)} suffix="m" accent="lime" />
              <Metric label="Mid-energy" hint="halfway echo · RH50" value={fmt(selected.rh50_m)} suffix="m" />
              <Metric label="How leafy" hint="cover of the 25 m circle" value={fmt(coverPct, 0)} suffix="%" accent="amber" />
              <Metric label="Ground" hint="elevation of the land" value={fmt(profile?.canopy.ground_elevation_m ?? selected.ground_elevation_m)} suffix="m" />
            </div>
            {loading && <p className="status-text">Loading the echo…</p>}
            {error && <p className="status-text error">{error}</p>}
            {profile && (
              <>
                <div className="viz-split">
                  <ForestStack
                    rh100={selected.rh100_m}
                    rh50={selected.rh50_m}
                    cover={profile.canopy.cover}
                    coverZ={profile.canopy.cover_z}
                    inspectT={inspectT}
                  />
                  <div className="xray-stage">
                    <div className="height-rail" aria-hidden="true">
                      <span className="rail-tick top">{fmt(selected.rh100_m, 0)} m top</span>
                      <span className="rail-tick mid" style={{ bottom: `${Math.min(90, Math.max(12, (selected.rh50_m / selected.rh100_m) * 100))}%` }}>{fmt(selected.rh50_m, 0)} m mid</span>
                      {selected.rh100_m >= 100 && (
                        <span className="rail-tick hundred" style={{ bottom: `${(100 / selected.rh100_m) * 100}%` }}>100 m ≈ 30 floors</span>
                      )}
                      <span className="rail-tick ground">ground</span>
                    </div>
                    <Suspense fallback={<p className="status-text">Loading pulse…</p>}>
                      <XRayChamber profile={profile} reducedMotion={reducedMotion} inspectT={inspectT} playKey={`${selected.shot}-${pulseKey}`} />
                    </Suspense>
                  </div>
                </div>
                <p className="inspect-readout" aria-live="polite">
                  {inspectMeters == null
                    ? 'Hover the leafy chart to slice the forest at a height.'
                    : `About ${fmt(inspectMeters, 0)} m above ground${coverAtInspect == null ? '' : ` · ${fmt(coverAtInspect, 0)}% leafy at this height`}.`}
                </p>
                <div className="chart-section">
                  <div className="chart-title"><span>The echo</span><span>bigger bump = more bounce</span></div>
                  <WaveformChart values={profile.waveform_dn} />
                </div>
                <div className="chart-section">
                  <div className="chart-title"><span>Leafiness from sky to soil</span><span>hover to inspect</span></div>
                  <ProfileChart
                    coverZ={profile.canopy.cover_z}
                    groundElevation={profile.canopy.ground_elevation_m}
                    highestReturn={profile.canopy.highest_return_elevation_m}
                    inspectT={inspectT}
                    onInspect={setInspectT}
                  />
                </div>
                <div className="evidence">
                  <p>{describeQuality(profile.quality)}</p>
                  <p className="evidence-meta">
                    {acquired ?? '2019 overpass'} · {selected.beam} · pulse {selected.shot}
                    {' · '}{fmt(selected.lat, 4)}° N, {fmt(Math.abs(selected.lon), 4)}° W
                  </p>
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
          <span className="kicker">What this is</span>
          <h2>A measured echo, not a photograph</h2>
        </div>
        <p>
          NASA’s GEDI instrument on the ISS fires a laser, listens to the bounce, and records how the forest is arranged from crown to ground.
          We joined the waveform, height, and canopy products for this park. It is not a 3D model of individual trees, and the fire view is history, not a warning.
        </p>
        <div className="source-list">
          <a href="https://gedi.umd.edu/dataproducts/products/" target="_blank" rel="noreferrer">NASA GEDI products</a>
          <a href="https://epqs.nationalmap.gov/v1/docs" target="_blank" rel="noreferrer">USGS 3DEP terrain</a>
          <a href="https://nasa-gibs.github.io/gibs-api-docs/access-basics/" target="_blank" rel="noreferrer">NASA GIBS imagery</a>
        </div>
      </section>

      <footer className="footer">
        <span>Captured {index.generated_on}</span>
        <span>No login · static NASA-derived fixture</span>
      </footer>
    </>
  );
}

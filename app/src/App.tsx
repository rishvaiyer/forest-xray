import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ForestMap } from './map/ForestMap';
import { XRayChamber } from './xray/XRayChamber';
import { fmt, ProfileChart, WaveformChart } from './charts/Charts';
import { ComparePanel } from './compare/ComparePanel';
import { FireReplayPanel } from './fire/FireReplayPanel';

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
  const [selectedShot, setSelectedShot] = useState<number | null>(shotFromUrl());
  const [profile, setProfile] = useState<FootprintProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);
  const [absoluteScale, setAbsoluteScale] = useState(false);
  const [fireStop, setFireStop] = useState('before');
  const [copyLabel, setCopyLabel] = useState('COPY SHARE LINK');
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    Promise.all([loadClientIndex(), loadFireReplay()])
      .then(([clientIndex, fire]) => {
        setIndex(clientIndex);
        setFireReplay(fire);
        const shot = shotFromUrl() ?? clientIndex.default_shot;
        setSelectedShot(shot);
        setCompareA(clientIndex.footprints[0]?.shot ?? shot);
        setCompareB(clientIndex.footprints[1]?.shot ?? shot);
      })
      .catch((e: Error) => setBootError(e.message));
  }, []);

  const selected = useMemo(() => {
    if (!index || selectedShot === null) return null;
    return index.footprints.find((f) => f.shot === selectedShot) ?? index.footprints[0];
  }, [index, selectedShot]);

  const selectShot = useCallback((shot: number) => {
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
      setCopyLabel('COPIED');
      setTimeout(() => setCopyLabel('COPY SHARE LINK'), 1200);
    } catch {
      setCopyLabel(shareUrl(selectedShot, mode).slice(-24));
    }
  };

  if (bootError) {
    return <p className="status-text error">Failed to load data bundle: {bootError}</p>;
  }

  if (!index || !fireReplay || selectedShot === null || !selected || compareA === null || compareB === null) {
    return <p className="status-text">Loading Forest X-Ray bundle…</p>;
  }

  const showFirePerimeter = mode === 'fire';

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">⌁</span>
          <div>
            <strong>FOREST X-RAY</strong>
            <small>ORBITAL CANOPY OBSERVATORY</small>
          </div>
        </div>
        <nav className="mode-nav" aria-label="View mode">
          {(['scan', 'compare', 'fire'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`mode-button ${mode === m ? 'is-active' : ''}`}
              onClick={() => {
                setMode(m);
                updateUrl(selectedShot, m);
                if (m === 'fire') selectShot(fireReplay.gedi_shot);
              }}
            >
              {m === 'scan' ? 'SCAN' : m === 'compare' ? 'COMPARE' : 'FIRE REPLAY'}
            </button>
          ))}
        </nav>
        <div className="header-meta">
          <span className="live-dot" />
          <span>LOCAL PROOF MODE</span>
          <span className="version-chip">GEDI V{index.collection_version}</span>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">REDWOOD NATIONAL & STATE PARKS · CALIFORNIA</div>
        <h1>Read the forest in layers.</h1>
        <p>A measured scan of canopy structure, returned photon energy, and terrain. One footprint at a time.</p>
      </section>

      <section className="how-to panel">
        <div className="how-to-intro">
          <span className="kicker">START HERE</span>
          <h2>How to read this, like you are five</h2>
          <p>Think of GEDI as a space flashlight. It shines down, listens to the echo, and turns that echo into a forest height story.</p>
        </div>
        <div className="how-to-steps">
          {[
            ['01', 'Pick a column', 'Each glowing column is one 25 m circle on the ground where the satellite sent a laser pulse.'],
            ['02', 'Follow the squiggle', 'The waveform is the echo. Bigger bumps mean more laser energy bounced back.'],
            ['03', 'Read the numbers', 'RH100 is the top of the measured return. RH50 is halfway. COVER is how leafy the spot looks.'],
          ].map(([num, title, body]) => (
            <article key={num} className="how-to-step">
              <span className="step-number">{num}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <main className="main-grid">
        <section className="panel map-panel">
          <div className="panel-head">
            <div>
              <span className="kicker">01 · ORBITAL SWEEP</span>
              <h2>Footprint field</h2>
            </div>
            <span className="panel-count">{index.joined_high_quality_footprints.toLocaleString()} JOINED</span>
          </div>
          <ForestMap
            bbox={index.bbox}
            footprints={index.footprints}
            selectedShot={selectedShot}
            firePerimeter={showFirePerimeter ? fireReplay.perimeter : null}
            fireOpacity={fireStop === 'before' ? 0.08 : fireStop === 'during' ? 0.35 : 0.22}
            onSelect={selectShot}
          />
          <div className="map-legend">
            <span className="legend-dot selected" />
            <span>selected footprint</span>
            <span className="legend-dot" />
            <span>high-quality returns</span>
            <span className="map-note">25 m nominal footprint · MapLibre terrain</span>
          </div>
        </section>

        {mode === 'scan' && (
          <section className="panel xray-panel">
            <div className="panel-head">
              <div>
                <span className="kicker">02 · SELECTED RETURN</span>
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
              <Metric label="COVER" value={profile ? fmt(profile.canopy.cover * 100) : '—'} suffix="%" accent="amber" />
              <Metric label="GROUND" value={fmt(profile?.canopy.ground_elevation_m ?? selected.ground_elevation_m)} suffix="m" />
            </div>
            {loading && <p className="status-text">Loading waveform profile…</p>}
            {error && <p className="status-text error">{error}</p>}
            {profile && (
              <>
                <XRayChamber profile={profile} reducedMotion={reducedMotion} />
                <div className="chart-section">
                  <div className="chart-title"><span>RETURNED ENERGY</span><span>{profile.waveform_dn.length.toLocaleString()} bins</span></div>
                  <WaveformChart values={profile.waveform_dn} />
                </div>
                <div className="chart-section">
                  <div className="chart-title"><span>CANOPY COVER PROFILE</span><span>top → ground</span></div>
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
        />
      )}

      {mode === 'fire' && <FireReplayPanel bundle={fireReplay} onTimelineChange={setFireStop} />}

      <section className="provenance panel">
        <div>
          <span className="kicker">TRACEABILITY</span>
          <h2>What this scan is, and is not</h2>
        </div>
        <p>This view is built from joined GEDI Level 1B waveform, Level 2A relative heights, and Level 2B canopy structure. It is a scientific footprint visualization, not a literal photograph or reconstruction of individual trees.</p>
        <div className="source-list">
          <a href="https://gedi.umd.edu/dataproducts/products/" target="_blank" rel="noreferrer">NASA GEDI products ↗</a>
          <a href="https://epqs.nationalmap.gov/v1/docs" target="_blank" rel="noreferrer">USGS 3DEP terrain ↗</a>
          <a href="https://nasa-gibs.github.io/gibs-api-docs/access-basics/" target="_blank" rel="noreferrer">NASA GIBS imagery ↗</a>
        </div>
      </section>

      <footer className="footer">
        <span>PROOF CAPTURED {index.generated_on}</span>
        <span>NO BACKEND · STATIC NASA-DERIVED FIXTURE</span>
      </footer>
    </>
  );
}

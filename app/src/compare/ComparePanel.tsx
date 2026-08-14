import { useEffect, useState } from 'react';
import type { FootprintProfile, FootprintSummary, StoryPair } from '../types';
import { loadProfile } from '../data/loadFootprint';
import { compareFootprints } from './compareFootprints';
import { fmt, ProfileChart, WaveformChart } from '../charts/Charts';

interface ComparePanelProps {
  footprints: FootprintSummary[];
  shotA: string;
  shotB: string;
  absoluteScale: boolean;
  onShotA: (shot: string) => void;
  onShotB: (shot: string) => void;
  onToggleScale: () => void;
  storyPairs?: StoryPair[];
}

function CompareSlot({
  label,
  summary,
  profile,
  loading,
  error,
  waveMax,
  heightMax,
  elevationMin,
  elevationMax,
}: {
  label: string;
  summary: FootprintSummary | undefined;
  profile: FootprintProfile | null;
  loading: boolean;
  error: string | null;
  waveMax?: number;
  heightMax?: number;
  elevationMin?: number;
  elevationMax?: number;
}) {
  if (!summary) return <div className="compare-slot">{label}: not selected</div>;
  return (
    <div className="compare-slot">
      <div className="compare-slot-head">
        <span className="kicker">{label}</span>
        <span className="beam-tag">{summary.beam}</span>
        <span className="shot-id">{summary.shot}</span>
      </div>
      <div className="metric-grid compare-metrics">
        <div className="metric lime"><span className="metric-label">Canopy top</span><strong>{fmt(summary.rh100_m)}</strong><span className="metric-suffix">m</span></div>
        <div className="metric"><span className="metric-label">Mid-energy</span><strong>{fmt(summary.rh50_m)}</strong><span className="metric-suffix">m</span></div>
        <div className="metric amber"><span className="metric-label">How leafy</span><strong>{fmt((profile?.canopy.cover ?? summary.cover) * 100, 0)}</strong><span className="metric-suffix">%</span></div>
        <div className="metric"><span className="metric-label">PAI</span><strong>{profile ? fmt(profile.canopy.pai) : '—'}</strong><span className="metric-suffix"></span></div>
      </div>
      {loading && <p className="status-text">Loading profile…</p>}
      {error && <p className="status-text error">{error}</p>}
      {profile && (
        <>
          <div className="chart-section">
            <div className="chart-title"><span>RETURNED ENERGY</span><span>{profile.waveform_dn.length.toLocaleString()} bins</span></div>
            <WaveformChart values={profile.waveform_dn} sharedMax={waveMax} />
          </div>
          <div className="chart-section">
            <div className="chart-title"><span>CANOPY COVER PROFILE</span><span>top → ground</span></div>
            <ProfileChart
              coverZ={profile.canopy.cover_z}
              groundElevation={profile.canopy.ground_elevation_m}
              highestReturn={profile.canopy.highest_return_elevation_m}
              heightMax={heightMax}
              elevationMin={elevationMin}
              elevationMax={elevationMax}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function ComparePanel({ footprints, shotA, shotB, absoluteScale, onShotA, onShotB, onToggleScale, storyPairs = [] }: ComparePanelProps) {
  const [profileA, setProfileA] = useState<FootprintProfile | null>(null);
  const [profileB, setProfileB] = useState<FootprintProfile | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);

  const summaryA = footprints.find((f) => f.shot === shotA);
  const summaryB = footprints.find((f) => f.shot === shotB);

  useEffect(() => {
    setLoadingA(true);
    setErrorA(null);
    loadProfile(shotA).then(setProfileA).catch((e: Error) => setErrorA(e.message)).finally(() => setLoadingA(false));
  }, [shotA]);

  useEffect(() => {
    setLoadingB(true);
    setErrorB(null);
    loadProfile(shotB).then(setProfileB).catch((e: Error) => setErrorB(e.message)).finally(() => setLoadingB(false));
  }, [shotB]);

  const summaryLines =
    profileA && profileB ? compareFootprints(profileA, profileB) : [];

  const waveMax = profileA && profileB
    ? Math.max(...profileA.waveform_dn, ...profileB.waveform_dn)
    : undefined;
  const heightMax = profileA && profileB && !absoluteScale
    ? Math.max(
        profileA.canopy.highest_return_elevation_m - profileA.canopy.ground_elevation_m,
        profileB.canopy.highest_return_elevation_m - profileB.canopy.ground_elevation_m,
      )
    : undefined;
  const elevationMin = profileA && profileB && absoluteScale
    ? Math.min(profileA.canopy.ground_elevation_m, profileB.canopy.ground_elevation_m)
    : undefined;
  const elevationMax = profileA && profileB && absoluteScale
    ? Math.max(profileA.canopy.highest_return_elevation_m, profileB.canopy.highest_return_elevation_m)
    : undefined;

  return (
    <section className="panel compare-panel">
      <div className="panel-head">
        <div>
          <span className="kicker">Side by side</span>
          <h2>Two spotlights, side by side</h2>
        </div>
        <button type="button" className="ghost-button" onClick={onToggleScale}>
          {absoluteScale ? 'Use shared height scale' : 'Use absolute elevation'}
        </button>
      </div>
      {storyPairs.length > 0 && (
        <div className="story-pairs" aria-label="Curated comparisons">
          {storyPairs.map((pair) => {
            const active = shotA === pair.shot_a && shotB === pair.shot_b;
            return (
              <button
                key={pair.id}
                type="button"
                className={`story-pair ${active ? 'is-active' : ''}`}
                onClick={() => { onShotA(pair.shot_a); onShotB(pair.shot_b); }}
              >
                <span className="story-pair-label">{pair.label}</span>
                <span className="story-pair-prompt">{pair.prompt}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="compare-selectors">
        <label>
          Footprint A
          <select value={shotA} onChange={(e) => onShotA(e.target.value)}>
            {footprints.map((f) => (
              <option key={f.shot} value={f.shot} disabled={f.shot === shotB}>{f.shot} · RH100 {fmt(f.rh100_m)} m</option>
            ))}
          </select>
        </label>
        <label>
          Footprint B
          <select value={shotB} onChange={(e) => onShotB(e.target.value)}>
            {footprints.map((f) => (
              <option key={f.shot} value={f.shot} disabled={f.shot === shotA}>{f.shot} · RH100 {fmt(f.rh100_m)} m</option>
            ))}
          </select>
        </label>
      </div>
      <div className="compare-grid">
        <CompareSlot
          label="FOOTPRINT A"
          summary={summaryA}
          profile={profileA}
          loading={loadingA}
          error={errorA}
          waveMax={waveMax}
          heightMax={heightMax}
          elevationMin={elevationMin}
          elevationMax={elevationMax}
        />
        <CompareSlot
          label="FOOTPRINT B"
          summary={summaryB}
          profile={profileB}
          loading={loadingB}
          error={errorB}
          waveMax={waveMax}
          heightMax={heightMax}
          elevationMin={elevationMin}
          elevationMax={elevationMax}
        />
      </div>
      {summaryLines.length > 0 && (
        <div className="compare-summary">
          <span className="kicker">Rule-based summary</span>
          <ul>{summaryLines.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

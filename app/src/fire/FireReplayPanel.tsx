import { useState } from 'react';
import type { FireReplayBundle } from '../types';
import { fmt } from '../charts/Charts';

interface FireReplayPanelProps {
  bundle: FireReplayBundle;
  onTimelineChange?: (stopId: string) => void;
}

export function FireReplayPanel({ bundle, onTimelineChange }: FireReplayPanelProps) {
  const [activeStop, setActiveStop] = useState(bundle.timeline[0]?.id ?? 'before');

  const stop = bundle.timeline.find((s) => s.id === activeStop) ?? bundle.timeline[0];

  const handleStop = (id: string) => {
    setActiveStop(id);
    onTimelineChange?.(id);
  };

  return (
    <section className="panel fire-panel">
      <div className="panel-head">
        <div>
          <span className="kicker">Historical replay</span>
          <h2>{bundle.fire.name} ({bundle.fire.year})</h2>
        </div>
        <span className="version-chip">{bundle.severity_at_point.label}</span>
      </div>
      <p className="fire-disclaimer">{bundle.fire.disclaimer}</p>
      <div className="fire-timeline" role="tablist" aria-label="Fire replay timeline">
        {bundle.timeline.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeStop === item.id}
            className={`timeline-stop ${activeStop === item.id ? 'is-active' : ''}`}
            onClick={() => handleStop(item.id)}
          >
            <span className="timeline-label">{item.label}</span>
            <span className="timeline-date">{item.date}</span>
          </button>
        ))}
      </div>
      <p className="timeline-description">{stop?.description}</p>
      <div className="fire-impact-card">
        <span className="kicker">WHAT CHANGED</span>
        <div className="fire-metrics">
          <div>
            <span className="metric-label">PRE-FIRE RH100</span>
            <strong>{fmt(bundle.pre_fire_canopy.rh100_m)} m</strong>
          </div>
          <div>
            <span className="metric-label">PRE-FIRE COVER</span>
            <strong>{fmt(bundle.pre_fire_canopy.cover * 100, 0)}%</strong>
          </div>
          <div>
            <span className="metric-label">POST-FIRE SEVERITY</span>
            <strong>{bundle.severity_at_point.label}</strong>
          </div>
          <div>
            <span className="metric-label">SEVERITY DATE</span>
            <strong>{bundle.severity_at_point.observation_date}</strong>
          </div>
        </div>
        <p className="truth-boundary">{bundle.truth_boundary}</p>
        <p className="fire-source">
          Sources: {bundle.fire.source} · {bundle.severity_at_point.source}
        </p>
      </div>
    </section>
  );
}

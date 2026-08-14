const fmt = (value: number, digits = 1) => Number(value).toFixed(digits);

interface WaveformChartProps {
  values: number[];
  sharedMax?: number;
}

export function WaveformChart({ values, sharedMax }: WaveformChartProps) {
  const width = 640;
  const height = 170;
  const pad = { l: 35, r: 15, t: 14, b: 25 };
  const max = (sharedMax ?? Math.max(...values)) * 1.04;
  const x = (i: number) => pad.l + (i / (values.length - 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L ${x(values.length - 1)},${height - pad.b} L ${x(0)},${height - pad.b} Z`;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="chart-svg" role="img" aria-label="GEDI received waveform">
        {[0, 0.5, 1].map((tick) => (
          <line key={tick} x1={pad.l} x2={width - pad.r} y1={y(max * tick)} y2={y(max * tick)} className="chart-grid" />
        ))}
        <path d={area} className="wave-area" />
        <path d={line} className="wave-line" />
        <line x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} className="chart-axis" />
        <text x={5} y={pad.t + 4} className="chart-label">DN</text>
        <text x={width - 78} y={height - 6} className="chart-label">sample index</text>
      </svg>
    </div>
  );
}

interface ProfileChartProps {
  coverZ: number[];
  groundElevation: number;
  highestReturn: number;
  heightMax?: number;
  elevationMin?: number;
  elevationMax?: number;
}

export function ProfileChart({
  coverZ,
  groundElevation,
  highestReturn,
  heightMax,
  elevationMin,
  elevationMax,
}: ProfileChartProps) {
  const width = 640;
  const height = 145;
  const pad = { l: 35, r: 15, t: 12, b: 25 };
  const useAbsolute = elevationMin != null && elevationMax != null && elevationMax > elevationMin;
  const span = heightMax ?? (highestReturn - groundElevation);
  const x = (v: number) => pad.l + v * (width - pad.l - pad.r);
  const y = (i: number) => {
    if (useAbsolute) {
      const relative = (1 - i / (coverZ.length - 1)) * (highestReturn - groundElevation);
      const elevation = groundElevation + relative;
      const lo = elevationMin as number;
      const hi = elevationMax as number;
      const t = (elevation - lo) / (hi - lo);
      return pad.t + (1 - t) * (height - pad.t - pad.b);
    }
    const relative = (1 - i / (coverZ.length - 1)) * (highestReturn - groundElevation);
    const t = span > 0 ? relative / span : 0;
    return pad.t + (1 - t) * (height - pad.t - pad.b);
  };
  const line = coverZ.map((v, i) => `${i ? 'L' : 'M'}${x(v).toFixed(2)},${y(i).toFixed(2)}`).join(' ');
  const area = `M${pad.l},${pad.t} ${line.slice(1)} L${pad.l},${height - pad.b} Z`;

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const index = Math.round(t * (coverZ.length - 1));
    const cover = coverZ[index] * 100;
    const aboveGround = (1 - index / (coverZ.length - 1)) * (highestReturn - groundElevation);
    const cursor = svg.querySelector('.profile-cursor') as SVGLineElement | null;
    const readout = svg.parentElement?.querySelector('.profile-hover-readout');
    if (cursor) {
      const cursorY = pad.t + t * (height - pad.t - pad.b);
      cursor.setAttribute('y1', String(cursorY));
      cursor.setAttribute('y2', String(cursorY));
      cursor.setAttribute('opacity', '1');
    }
    if (readout) {
      readout.textContent = `About ${fmt(aboveGround, 0)} m above ground · ${fmt(cover, 0)}% canopy cover`;
    }
  };

  const handleLeave = (event: React.PointerEvent<SVGSVGElement>) => {
    const cursor = event.currentTarget.querySelector('.profile-cursor') as SVGLineElement | null;
    const readout = event.currentTarget.parentElement?.querySelector('.profile-hover-readout');
    if (cursor) cursor.setAttribute('opacity', '0');
    if (readout) readout.textContent = 'Hover the profile to inspect a height band.';
  };

  return (
    <div className="chart-wrap profile-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="chart-svg profile-interactive"
        role="img"
        tabIndex={0}
        aria-label="Canopy cover vertical profile. Hover to read a height band."
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
      >
        {[0, 0.5, 1].map((tick) => (
          <line key={tick} x1={x(tick)} x2={x(tick)} y1={pad.t} y2={height - pad.b} className="chart-grid" />
        ))}
        <path d={area} className="profile-area" />
        <path d={line} className="profile-line" />
        <line x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} className="chart-axis" />
        <text x={5} y={pad.t + 4} className="chart-label">{useAbsolute ? `${fmt(elevationMax ?? 0, 0)} m` : 'top'}</text>
        <text x={5} y={height - pad.b} className="chart-label">{useAbsolute ? `${fmt(elevationMin ?? 0, 0)} m` : 'ground'}</text>
        <text x={width - 75} y={height - 6} className="chart-label">cover →</text>
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={height - pad.b} className="profile-cursor" opacity="0" />
      </svg>
      <div className="profile-hover-readout" aria-live="polite">Hover the profile to inspect a height band.</div>
    </div>
  );
}

export { fmt };

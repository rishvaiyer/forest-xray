const fmt = (value: number, digits = 1) => Number(value).toFixed(digits);

interface WaveformChartProps {
  values: number[];
  sharedMax?: number;
}

export function WaveformChart({ values, sharedMax }: WaveformChartProps) {
  const width = 640;
  const height = 170;
  const pad = { l: 44, r: 15, t: 14, b: 28 };
  const max = (sharedMax ?? Math.max(...values)) * 1.04;
  const x = (i: number) => pad.l + (i / (values.length - 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L ${x(values.length - 1)},${height - pad.b} L ${x(0)},${height - pad.b} Z`;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="chart-svg" role="img" aria-label="Laser echo. Bigger bumps mean more energy bounced back.">
        {[0, 0.5, 1].map((tick) => (
          <line key={tick} x1={pad.l} x2={width - pad.r} y1={y(max * tick)} y2={y(max * tick)} className="chart-grid" />
        ))}
        <path d={area} className="wave-area" />
        <path d={line} className="wave-line" />
        <line x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} className="chart-axis" />
        <text x="4" y={pad.t + 4} className="chart-label">stronger</text>
        <text x="4" y={height - pad.b} className="chart-label">weaker</text>
        <text x={width - 92} y={height - 6} className="chart-label">time along the pulse</text>
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
  inspectT?: number | null;
  onInspect?: (t: number | null) => void;
}

export function ProfileChart({
  coverZ,
  groundElevation,
  highestReturn,
  heightMax,
  elevationMin,
  elevationMax,
  inspectT = null,
  onInspect,
}: ProfileChartProps) {
  const width = 640;
  const height = 145;
  const pad = { l: 44, r: 15, t: 12, b: 25 };
  const useAbsolute = elevationMin != null && elevationMax != null && elevationMax > elevationMin;
  const span = heightMax ?? (highestReturn - groundElevation);
  const x = (v: number) => pad.l + v * (width - pad.l - pad.r);
  const y = (i: number) => {
    if (useAbsolute) {
      const relative = (1 - i / (coverZ.length - 1)) * (highestReturn - groundElevation);
      const elevation = groundElevation + relative;
      const lo = elevationMin as number;
      const hi = elevationMax as number;
      const frac = (elevation - lo) / (hi - lo);
      return pad.t + (1 - frac) * (height - pad.t - pad.b);
    }
    const relative = (1 - i / (coverZ.length - 1)) * (highestReturn - groundElevation);
    const frac = span > 0 ? relative / span : 0;
    return pad.t + (1 - frac) * (height - pad.t - pad.b);
  };
  const line = coverZ.map((v, i) => `${i ? 'L' : 'M'}${x(v).toFixed(2)},${y(i).toFixed(2)}`).join(' ');
  const area = `M${pad.l},${pad.t} ${line.slice(1)} L${pad.l},${height - pad.b} Z`;
  const plotH = height - pad.t - pad.b;
  const cursorY = inspectT == null ? null : pad.t + (1 - inspectT) * plotH;

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fromTop = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    onInspect?.(1 - fromTop);
  };

  return (
    <div className="chart-wrap profile-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="chart-svg profile-interactive"
        role="img"
        tabIndex={0}
        aria-label="How leafy the forest is from the top down to the ground. Hover to inspect a height."
        onPointerMove={handleMove}
        onPointerLeave={() => onInspect?.(null)}
      >
        {[0, 0.5, 1].map((tick) => (
          <line key={tick} x1={x(tick)} x2={x(tick)} y1={pad.t} y2={height - pad.b} className="chart-grid" />
        ))}
        <path d={area} className="profile-area" />
        <path d={line} className="profile-line" />
        <line x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} className="chart-axis" />
        <text x="4" y={pad.t + 4} className="chart-label">{useAbsolute ? `${fmt(elevationMax ?? 0, 0)} m` : 'sky'}</text>
        <text x="4" y={height - pad.b} className="chart-label">{useAbsolute ? `${fmt(elevationMin ?? 0, 0)} m` : 'ground'}</text>
        <text x={width - 88} y={height - 6} className="chart-label">more leafy →</text>
        {cursorY != null && (
          <line x1={pad.l} x2={width - pad.r} y1={cursorY} y2={cursorY} className="profile-cursor" />
        )}
      </svg>
    </div>
  );
}

export { fmt };

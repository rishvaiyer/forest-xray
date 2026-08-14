interface ForestStackProps {
  rh100: number;
  rh50: number;
  cover: number;
  coverZ: number[];
  inspectT: number | null;
}

function fmt(value: number, digits = 0) {
  return value.toFixed(digits);
}

/** Layered canopy drawing: width follows cover. Easy to read without GEDI jargon. */
export function ForestStack({ rh100, rh50, cover, coverZ, inspectT }: ForestStackProps) {
  const width = 220;
  const height = 280;
  const groundY = height - 22;
  const topY = 18;
  const span = groundY - topY;
  const cx = width / 2;
  const layers = coverZ.length > 0 ? coverZ : [cover];

  return (
    <svg className="forest-stack" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Layered view of canopy from ground to top">
      <rect x="0" y="0" width={width} height={height} fill="#10151c" />
      <rect x="18" y={groundY} width={width - 36} height="10" rx="2" fill="#3a2418" />
      {layers.map((layerCover, i) => {
        const t = layers.length === 1 ? 0.5 : i / (layers.length - 1);
        const y = topY + t * span;
        const w = 18 + layerCover * 72;
        return (
          <ellipse
            key={i}
            cx={cx}
            cy={y}
            rx={w}
            ry={Math.max(3.2, span / layers.length)}
            fill="rgba(110, 228, 240, 0.16)"
            stroke="rgba(110, 228, 240, 0.45)"
            strokeWidth="0.8"
          />
        );
      })}
      <line x1={cx} x2={cx} y1={topY} y2={groundY} stroke="rgba(110,228,240,0.25)" strokeDasharray="3 4" />
      <text x="8" y={topY + 4} className="stack-label phosphor">Top · {fmt(rh100)} m</text>
      <text x="8" y={groundY - (rh50 / Math.max(rh100, 1)) * span + 4} className="stack-label ember">Mid-energy · {fmt(rh50)} m</text>
      <text x="8" y={groundY + 18} className="stack-label heartwood">Ground</text>
      {inspectT != null && (
        <line
          x1={24}
          x2={width - 24}
          y1={groundY - inspectT * span}
          y2={groundY - inspectT * span}
          className="stack-inspect"
        />
      )}
      <text x={cx} y={height - 6} textAnchor="middle" className="stack-caption">
        {fmt(cover * 100)}% of this 25 m circle has canopy
      </text>
    </svg>
  );
}

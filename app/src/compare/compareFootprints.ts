import type { FootprintProfile } from '../types';

const LIMITATION =
  'Each value is one ~25 m GEDI footprint, not individual trees.';

export function compareFootprints(
  a: FootprintProfile,
  b: FootprintProfile,
  threshold = 2,
): string[] {
  const lines: string[] = [];
  const rh100Delta = a.canopy.highest_return_elevation_m - a.canopy.ground_elevation_m
    - (b.canopy.highest_return_elevation_m - b.canopy.ground_elevation_m);
  const coverDelta = (a.canopy.cover - b.canopy.cover) * 100;
  const paiDelta = a.canopy.pai - b.canopy.pai;
  const groundDelta = a.canopy.ground_elevation_m - b.canopy.ground_elevation_m;

  if (Math.abs(rh100Delta) >= threshold) {
    const taller = rh100Delta > 0 ? 'A' : 'B';
    lines.push(
      `Footprint ${taller}'s measured canopy return is ${Math.abs(rh100Delta).toFixed(1)} m taller (RH100 relative height).`,
    );
  }
  if (Math.abs(coverDelta) >= 5) {
    const leafier = coverDelta > 0 ? 'A' : 'B';
    lines.push(
      `Footprint ${leafier} shows ${Math.abs(coverDelta).toFixed(0)} percentage points more canopy cover.`,
    );
  }
  if (Math.abs(paiDelta) >= 0.5) {
    const denser = paiDelta > 0 ? 'A' : 'B';
    lines.push(
      `Footprint ${denser} has higher plant-area index (PAI ${Math.abs(paiDelta).toFixed(2)} difference).`,
    );
  }
  if (Math.abs(groundDelta) >= threshold) {
    lines.push(
      `Ground elevation differs by ${Math.abs(groundDelta).toFixed(1)} m between the two footprints.`,
    );
  }
  if (lines.length === 0) {
    lines.push('These two footprints show similar canopy height, cover, and ground elevation within the comparison thresholds.');
  }
  lines.push(LIMITATION);
  return lines;
}

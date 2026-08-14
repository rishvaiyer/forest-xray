import type { FootprintSummary } from '../types';

/** North-to-south within each beam so stepping follows the orbital track. */
export function trackOrder(footprints: FootprintSummary[]): string[] {
  const grouped = new Map<string, FootprintSummary[]>();
  for (const row of footprints) {
    const list = grouped.get(row.beam) ?? [];
    list.push(row);
    grouped.set(row.beam, list);
  }
  const beams = [...grouped.keys()].sort();
  const ordered: string[] = [];
  for (const beam of beams) {
    const shots = grouped.get(beam) ?? [];
    shots.sort((a, b) => b.lat - a.lat);
    for (const shot of shots) ordered.push(shot.shot);
  }
  return ordered;
}

export function neighborShots(order: string[], shot: string) {
  const index = order.indexOf(shot);
  return {
    index,
    prev: index > 0 ? order[index - 1] : null,
    next: index >= 0 && index < order.length - 1 ? order[index + 1] : null,
  };
}

export function acquiredFromGranule(granule: string | undefined): string | null {
  if (!granule) return null;
  const match = granule.match(/_(\d{4})(\d{3})/);
  if (!match) return null;
  const year = Number(match[1]);
  const doy = Number(match[2]);
  const date = new Date(Date.UTC(year, 0, doy));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function heightInStories(meters: number): number {
  return Math.max(1, Math.round(meters / 3.3));
}

export function describeQuality(quality: Record<string, number> | undefined): string {
  if (!quality || Object.keys(quality).length === 0) {
    return 'Quality flags load with the waveform.';
  }
  const degrade = Object.entries(quality)
    .filter(([key, value]) => key.includes('degrade') && value !== 0);
  const failed = Object.entries(quality)
    .filter(([key, value]) => key.includes('quality_flag') && value !== 1);
  if (degrade.length === 0 && failed.length === 0) {
    return 'This pulse passed the NASA quality checks used for this demo.';
  }
  return 'This pulse has a quality or degrade flag. Treat the heights as less certain.';
}

export function leafyLabel(cover: number): string {
  const pct = cover * 100;
  if (pct >= 90) return 'Almost fully leafy';
  if (pct >= 70) return 'Mostly leafy';
  if (pct >= 40) return 'Patchy canopy';
  return 'More open';
}

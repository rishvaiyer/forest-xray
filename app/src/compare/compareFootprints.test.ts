import { describe, expect, it } from 'vitest';
import { compareFootprints } from './compareFootprints';
import type { FootprintProfile } from '../types';

function mockProfile(overrides: Partial<FootprintProfile['canopy']> & { shot: string }): FootprintProfile {
  const canopy = {
    ground_elevation_m: 50,
    highest_return_elevation_m: 150,
    sensitivity: 0.95,
    selected_algorithm: 1,
    pai: 5,
    cover: 0.9,
    fhd_normal: 0.5,
    pai_z: [0.1, 0.2],
    pavd_z: [0.1, 0.2],
    cover_z: [0.8, 0.9],
    ...overrides,
  };
  return {
    shot: overrides.shot,
    beam: 'BEAM0110',
    location: { lat: 41.28, lon: -124.02 },
    indices: {},
    quality: {},
    provenance: {},
    waveform_dn: [1, 2, 3],
    rh_m: Array(101).fill(0),
    canopy,
  };
}

describe('compareFootprints', () => {
  it('reports taller canopy when RH100 differs beyond threshold', () => {
    const a = mockProfile({ shot: '1', highest_return_elevation_m: 180, ground_elevation_m: 50 });
    const b = mockProfile({ shot: '2', highest_return_elevation_m: 140, ground_elevation_m: 50 });
    const lines = compareFootprints(a, b);
    expect(lines.some((l) => l.includes("Footprint A's measured canopy"))).toBe(true);
    expect(lines.at(-1)).toContain('25 m GEDI footprint');
  });

  it('reports similar footprints when within thresholds', () => {
    const a = mockProfile({ shot: '1' });
    const b = mockProfile({ shot: '2' });
    const lines = compareFootprints(a, b);
    expect(lines[0]).toContain('similar canopy height');
  });

  it('reports cover difference when large enough', () => {
    const a = mockProfile({ shot: '1', cover: 0.98 });
    const b = mockProfile({ shot: '2', cover: 0.5 });
    const lines = compareFootprints(a, b);
    expect(lines.some((l) => l.includes('canopy cover'))).toBe(true);
  });
});

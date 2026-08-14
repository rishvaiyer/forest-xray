import { describe, expect, it } from 'vitest';
import { acquiredFromGranule, heightInStories, neighborShots, trackOrder } from './track';
import type { FootprintSummary } from '../types';

function shot(partial: Partial<FootprintSummary> & { shot: string; beam: string; lat: number }): FootprintSummary {
  return {
    lon: -124,
    rh100_m: 80,
    rh50_m: 40,
    ground_elevation_m: 10,
    highest_return_elevation_m: 90,
    cover: 0.8,
    ...partial,
  };
}

describe('trackOrder', () => {
  it('groups by beam and walks north to south', () => {
    const order = trackOrder([
      shot({ shot: 'south', beam: 'BEAM0110', lat: 41.2 }),
      shot({ shot: 'north', beam: 'BEAM0110', lat: 41.4 }),
      shot({ shot: 'other', beam: 'BEAM0000', lat: 41.3 }),
    ]);
    expect(order).toEqual(['other', 'north', 'south']);
  });
});

describe('neighborShots', () => {
  it('returns previous and next along the ordered track', () => {
    expect(neighborShots(['a', 'b', 'c'], 'b')).toEqual({ index: 1, prev: 'a', next: 'c' });
    expect(neighborShots(['a', 'b', 'c'], 'a').prev).toBeNull();
  });
});

describe('acquiredFromGranule', () => {
  it('reads year and day-of-year from a GEDI granule name', () => {
    expect(acquiredFromGranule('GEDI01_B_2019170155833_O02932_02_T02267_02_006_02_V003.h5')).toBe('Jun 19, 2019');
  });
});

describe('heightInStories', () => {
  it('turns meters into an approximate building height', () => {
    expect(heightInStories(100)).toBe(30);
  });
});

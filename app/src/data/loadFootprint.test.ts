import { describe, expect, it } from 'vitest';
import { parseExplorerSearch } from './loadFootprint';

describe('parseExplorerSearch', () => {
  it('reads compare pair ids from the query string', () => {
    expect(parseExplorerSearch('?mode=compare&a=11&b=22&shot=11')).toEqual({
      shot: '11',
      mode: 'compare',
      a: '11',
      b: '22',
    });
  });

  it('defaults to scan when mode is absent', () => {
    expect(parseExplorerSearch('shot=99').mode).toBe('scan');
  });
});

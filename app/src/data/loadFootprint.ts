import type { ClientIndex, FireReplayBundle, FootprintProfile } from '../types';

const profileCache = new Map<string, FootprintProfile>();
let indexCache: ClientIndex | null = null;

function dataBase(): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data`;
}

export async function loadClientIndex(): Promise<ClientIndex> {
  if (indexCache) return indexCache;
  const response = await fetch(`${dataBase()}/forest_xray_client.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load client index (${response.status})`);
  indexCache = (await response.json()) as ClientIndex;
  return indexCache;
}

export async function loadProfile(shot: string): Promise<FootprintProfile> {
  const cached = profileCache.get(shot);
  if (cached) return cached;
  const response = await fetch(`${dataBase()}/profiles/${shot}.json`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Profile ${shot} not found (${response.status})`);
  }
  const profile = (await response.json()) as FootprintProfile;
  profileCache.set(shot, profile);
  return profile;
}

export async function loadFireReplay(): Promise<FireReplayBundle> {
  const response = await fetch(`${dataBase()}/fire_replay.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load fire replay (${response.status})`);
  return (await response.json()) as FireReplayBundle;
}

export function shotFromUrl(): string | null {
  const shot = new URLSearchParams(window.location.search).get('shot');
  return shot && shot.length > 0 ? shot : null;
}

export function modeFromUrl(): 'scan' | 'compare' | 'fire' {
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'compare' || mode === 'fire') return mode;
  return 'scan';
}

export function compareFromUrl(): { a: string | null; b: string | null } {
  const params = new URLSearchParams(window.location.search);
  const a = params.get('a');
  const b = params.get('b');
  return {
    a: a && a.length > 0 ? a : null,
    b: b && b.length > 0 ? b : null,
  };
}

export function parseExplorerSearch(search: string) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const mode = params.get('mode');
  return {
    shot: params.get('shot') || null,
    mode: mode === 'compare' || mode === 'fire' ? mode : 'scan' as const,
    a: params.get('a') || null,
    b: params.get('b') || null,
  };
}

export function updateUrl(
  shot: string,
  mode: 'scan' | 'compare' | 'fire' = 'scan',
  pair?: { a?: string; b?: string },
) {
  const url = new URL(window.location.href);
  url.searchParams.set('shot', shot);
  if (mode === 'scan') url.searchParams.delete('mode');
  else url.searchParams.set('mode', mode);
  if (mode === 'compare' && pair?.a && pair?.b) {
    url.searchParams.set('a', pair.a);
    url.searchParams.set('b', pair.b);
  } else {
    url.searchParams.delete('a');
    url.searchParams.delete('b');
  }
  window.history.replaceState({}, '', url.toString());
}

export function shareUrl(
  shot: string,
  mode: 'scan' | 'compare' | 'fire' = 'scan',
  pair?: { a?: string; b?: string },
): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('shot', shot);
  if (mode !== 'scan') url.searchParams.set('mode', mode);
  if (mode === 'compare' && pair?.a && pair?.b) {
    url.searchParams.set('a', pair.a);
    url.searchParams.set('b', pair.b);
  }
  return url.toString();
}

import type { ClientIndex, FireReplayBundle, FootprintProfile } from '../types';

const profileCache = new Map<number, FootprintProfile>();
let indexCache: ClientIndex | null = null;

function dataBase(): string {
  return import.meta.env.DEV ? '/data' : './data';
}

export async function loadClientIndex(): Promise<ClientIndex> {
  if (indexCache) return indexCache;
  const response = await fetch(`${dataBase()}/forest_xray_client.json`);
  if (!response.ok) throw new Error(`Failed to load client index (${response.status})`);
  indexCache = (await response.json()) as ClientIndex;
  return indexCache;
}

export async function loadProfile(shot: number): Promise<FootprintProfile> {
  const cached = profileCache.get(shot);
  if (cached) return cached;
  const response = await fetch(`${dataBase()}/profiles/${shot}.json`);
  if (!response.ok) {
    throw new Error(`Profile ${shot} not found (${response.status})`);
  }
  const profile = (await response.json()) as FootprintProfile;
  profileCache.set(shot, profile);
  return profile;
}

export async function loadFireReplay(): Promise<FireReplayBundle> {
  const response = await fetch(`${dataBase()}/fire_replay.json`);
  if (!response.ok) throw new Error(`Failed to load fire replay (${response.status})`);
  return (await response.json()) as FireReplayBundle;
}

export function shotFromUrl(): number | null {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  return shot ? Number(shot) : null;
}

export function modeFromUrl(): 'scan' | 'compare' | 'fire' {
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'compare' || mode === 'fire') return mode;
  return 'scan';
}

export function updateUrl(shot: number, mode: 'scan' | 'compare' | 'fire' = 'scan') {
  const url = new URL(window.location.href);
  url.searchParams.set('shot', String(shot));
  if (mode === 'scan') url.searchParams.delete('mode');
  else url.searchParams.set('mode', mode);
  window.history.replaceState({}, '', url.toString());
}

export function shareUrl(shot: number, mode: 'scan' | 'compare' | 'fire' = 'scan'): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('shot', String(shot));
  if (mode !== 'scan') url.searchParams.set('mode', mode);
  return url.toString();
}

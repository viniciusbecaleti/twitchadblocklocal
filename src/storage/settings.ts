export interface Settings { enabled: boolean; disabledChannels: string[]; confirmedBlocked: number; }
export const DEFAULT_SETTINGS: Settings = { enabled: true, disabledChannels: [], confirmedBlocked: 0 };

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored } as Settings;
}
export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set(next);
  return next;
}
export function channelFromPath(path = location.pathname): string | null {
  const value = path.split('/').filter(Boolean)[0]?.toLowerCase();
  return value && !['directory', 'downloads', 'settings', 'search'].includes(value) ? value : null;
}

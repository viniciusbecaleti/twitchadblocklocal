export type LogLevel = 'info' | 'warn' | 'error';
export interface Diagnostic { at: string; level: LogLevel; event: string; detail?: string; }
const KEY = 'diagnostics'; const MAX = 60;
let writes: Promise<void> = Promise.resolve();
export async function log(level: LogLevel, event: string, detail?: string): Promise<void> {
  const entry: Diagnostic = { at: new Date().toISOString(), level, event, detail };
  console[level === 'info' ? 'log' : level]('[Twitch AdBlock]', entry);
  const pending = writes.then(async () => {
    const { [KEY]: current = [] } = await chrome.storage.local.get(KEY);
    await chrome.storage.local.set({ [KEY]: [...current, entry].slice(-MAX) });
  });
  writes = pending.catch(() => undefined);
  await pending;
}
export async function diagnostics(): Promise<Diagnostic[]> { return (await chrome.storage.local.get(KEY))[KEY] ?? []; }

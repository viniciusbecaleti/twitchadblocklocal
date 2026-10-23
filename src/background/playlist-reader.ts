import type { PlaylistReply } from '../player/playlist-request';

export function isPlaylistUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 16384) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.hostname === 'ttvnw.net' || url.hostname.endsWith('.ttvnw.net')) && url.pathname.endsWith('.m3u8');
  } catch { return false; }
}

export async function readPlaylist(url: unknown): Promise<PlaylistReply> {
  if (!isPlaylistUrl(url)) return { error: 'forbidden-url' };
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { error: `http-${response.status}` };
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024 || !text.trimStart().startsWith('#EXTM3U')) return { error: 'invalid-playlist' };
    return { text };
  } catch (error) {
    return { error: error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'network-error' };
  }
}

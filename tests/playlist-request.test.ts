import { afterEach, expect, it, vi } from 'vitest';
import { fetchPlaylistText } from '../src/player/playlist-request';
import { isPlaylistUrl, readPlaylist } from '../src/background/playlist-reader';

afterEach(() => vi.unstubAllGlobals());

it('reads via the extension runtime instead of a CORS-restricted content fetch', async () => {
  const text = '#EXTM3U\n#EXT-X-TARGETDURATION:2';
  const sendMessage = vi.fn().mockResolvedValue({ text });
  const pageFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  vi.stubGlobal('fetch', pageFetch);
  expect(await fetchPlaylistText('https://cdn.ttvnw.net/live.m3u8')).toBe(text);
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'playback:playlist', url: 'https://cdn.ttvnw.net/live.m3u8' });
  expect(pageFetch).toHaveBeenCalledTimes(1);
});

it('preserves a successful page-origin playlist request without replacing it with the background reader', async () => {
  const text = '#EXTM3U\n#EXT-X-TARGETDURATION:2';
  const sendMessage = vi.fn().mockResolvedValue({ error: 'http-403' });
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => text }));
  expect(await fetchPlaylistText('https://cdn.ttvnw.net/live.m3u8')).toBe(text);
  expect(sendMessage).not.toHaveBeenCalled();
});

it('restricts the background reader to Twitch HLS playlists and preserves useful failures', async () => {
  for (const url of ['http://cdn.ttvnw.net/live.m3u8', 'https://cdn.ttvnw.net.evil.test/live.m3u8', 'https://user:pass@cdn.ttvnw.net/live.m3u8', 'https://cdn.ttvnw.net/secret.json']) expect(isPlaylistUrl(url)).toBe(false);
  const request = vi.fn().mockResolvedValue({ ok: false, status: 403 });
  vi.stubGlobal('fetch', request);
  expect(await readPlaylist('https://evil.test/live.m3u8')).toEqual({ error: 'forbidden-url' });
  expect(request).not.toHaveBeenCalled();
  expect(await readPlaylist('https://cdn.ttvnw.net/live.m3u8')).toEqual({ error: 'http-403' });
  request.mockResolvedValue({ ok: true, text: async () => 'not a playlist' });
  expect(await readPlaylist('https://cdn.ttvnw.net/live.m3u8')).toEqual({ error: 'invalid-playlist' });
});

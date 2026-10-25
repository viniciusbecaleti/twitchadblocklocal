import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('keeps a moving 360p live during delayed HD recovery after a mid-roll', async ({ page }) => {
  test.setTimeout(45000);
  let phase: 'live' | 'ad' | 'hd-pending' | 'ready' = 'live';
  let prematureHdChecks = 0;
  const started = Date.now();
  const file = await readFile(resolve('tests/fixtures/hls/continuous.mp4'));
  const { version } = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
  const playlist = await readFile(resolve('tests/fixtures/hls/continuous.m3u8'), 'utf8');
  const ranges = [...playlist.matchAll(/#EXT-X-BYTERANGE:(\d+)@(\d+)/g)].map((match) => ({ length: Number(match[1]), offset: Number(match[2]) }));
  const initLength = Number(playlist.match(/BYTERANGE="(\d+)@0"/)![1]);
  await page.addInitScript(() => {
    Object.assign(window, { chrome: { storage: { local: { get: async () => ({ playerVolume: 0.4, playerMuted: true }) } } } });
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
    if (url.hostname === 'www.twitch.tv') return route.fulfill({ contentType: 'text/html', body: '<div data-a-target="video-player"><div style="width:640px;height:360px"><video></video></div></div>' });
    if (url.hostname === 'gql.twitch.tv') {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ headers: { ...headers, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
      return route.fulfill({ headers, json: { data: { streamPlaybackAccessToken: { value: route.request().postDataJSON().variables.playerType, signature: 'fixture' } } } });
    }
    if (url.hostname === 'usher.ttvnw.net') {
      const type = url.searchParams.get('token')!;
      const height = type === 'autoplay' && phase === 'ad' ? 360 : 1080;
      return route.fulfill({ headers, contentType: 'application/vnd.apple.mpegurl', body: `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=${height === 360 ? '640x360' : '1920x1080'}\nhttps://media.test/${type}/${height}/live.m3u8\n` });
    }
    if (url.hostname === 'media.test' && url.pathname.endsWith('/live.m3u8')) {
      const clean = phase === 'live' || phase === 'ready' || url.pathname === '/autoplay/360/live.m3u8';
      if (phase === 'hd-pending' && url.pathname === '/site/1080/live.m3u8') prematureHdChecks += 1;
      const last = Math.min(ranges.length - 1, Math.floor((Date.now() - started) / 1000) + 3);
      const first = Math.max(0, last - 5);
      const body = `#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:${first}\n#EXT-X-MAP:URI="/init.mp4"\n` + Array.from({ length: last - first + 1 }, (_, index) => `#EXTINF:1,${clean ? '' : 'stitched-ad'}\n/segment${first + index}.m4s\n`).join('');
      return route.fulfill({ headers, contentType: 'application/vnd.apple.mpegurl', body });
    }
    if (url.hostname === 'media.test' && url.pathname === '/init.mp4') return route.fulfill({ headers, contentType: 'video/mp4', body: file.subarray(0, initLength) });
    const segment = url.pathname.match(/^\/segment(\d+)\.m4s$/);
    if (url.hostname === 'media.test' && segment) {
      const { offset, length } = ranges[Number(segment[1])];
      return route.fulfill({ headers, contentType: 'video/mp4', body: file.subarray(offset, offset + length) });
    }
    return route.abort();
  });
  await page.goto('https://www.twitch.tv/test');
  await page.addScriptTag({ path: resolve('dist/pageHook.js') });
  await page.addScriptTag({ path: resolve('dist/customPlayer.js') });
  await page.evaluate(async () => {
    await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-ID': 'fixture' }, body: JSON.stringify({ operationName: 'PlaybackAccessToken', variables: { login: 'test', playerType: 'site' } }) });
    (window as Window & { TwitchAdBlockPlayer?: { start: (token: unknown) => void } }).TwitchAdBlockPlayer!.start({ channel: 'test', value: 'site', signature: 'fixture' });
  });
  const host = page.locator('[data-twitch-adblock-player]');
  const video = host.locator('video');
  const quality = host.locator('select');
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThan(0);
  await expect(quality).toContainText('1080p');
  await expect(host).toHaveAttribute('data-twitch-adblock-version', version);
  phase = 'ad';
  await expect(quality).toContainText('360p');
  await expect(quality).not.toContainText('1080p');
  await expect(host.locator('[aria-live="polite"]')).toHaveCount(0);
  await expect(host).not.toContainText('Buscando transmissão');
  await host.evaluate((element: HTMLElement) => {
    element.dataset.waitingScreens = '0';
    new MutationObserver(() => {
      if (element.querySelector('[aria-live="polite"]') || element.textContent?.includes('Buscando transmissão')) {
        element.dataset.waitingScreens = String(Number(element.dataset.waitingScreens) + 1);
      }
    }).observe(element, { childList: true, characterData: true, subtree: true });
  });
  phase = 'hd-pending';
  await expect.poll(() => prematureHdChecks, { timeout: 10000 }).toBeGreaterThan(0);
  const position = await video.evaluate((node: HTMLVideoElement) => node.currentTime);
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThan(position + 1.5);
  await expect(host.locator('[aria-live="polite"]')).toHaveCount(0);
  await expect(quality).not.toContainText('1080p');
  await expect(host).toHaveAttribute('data-waiting-screens', '0');
  phase = 'ready';
  await expect(quality).toContainText('1080p', { timeout: 30000 });
  await expect(host.locator('[aria-live="polite"]')).toHaveCount(0);
  await expect(host).toHaveAttribute('data-waiting-screens', '0');
});

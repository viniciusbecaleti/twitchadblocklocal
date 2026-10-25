import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

for (const delayedUnmutedSettings of [false, true]) {
test(`the built player rejects a marked 360p ad with ${delayedUnmutedSettings ? 'delayed unmuted' : 'muted'} settings`, async ({ page }) => {
  let adFinished = false;
  let mediaRequests = 0;
  let masterRequests = 0;
  await page.addInitScript((delayed) => {
    Object.assign(window, {
      chrome: { storage: { local: { get: async () => {
        if (delayed) await new Promise((resolve) => setTimeout(resolve, 700));
        return { playerVolume: 0.4, playerMuted: !delayed };
      } } } },
    });
  }, delayedUnmutedSettings);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
    if (url.hostname === 'www.twitch.tv') {
      return route.fulfill({ contentType: 'text/html', body: '<div data-a-target="video-player"><div style="width:640px;height:360px"><video></video></div></div>' });
    }
    if (url.hostname === 'usher.ttvnw.net') {
      masterRequests += 1;
      return route.fulfill({ headers, contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=640x360\nhttps://media.test/live.m3u8\n' });
    }
    if (url.hostname === 'media.test' && url.pathname === '/live.m3u8') {
      mediaRequests += 1;
      const start = adFinished ? 3 : 0;
      const segments = adFinished ? [3, 4, 5, 6, 7] : [0, 1, 2];
      const body = `#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:${start}\n#EXT-X-MAP:URI="init.mp4"\n` + segments.map((index) => `#EXTINF:1,${adFinished ? '' : 'stitched-ad'}\nsegment${index}.m4s\n`).join('');
      return route.fulfill({ headers, contentType: 'application/vnd.apple.mpegurl', body });
    }
    if (url.hostname === 'media.test' && /^\/(init\.mp4|segment[0-7]\.m4s)$/.test(url.pathname)) {
      return route.fulfill({ headers, contentType: 'video/mp4', body: await readFile(resolve('tests/fixtures/hls', url.pathname.slice(1))) });
    }
    return route.abort();
  });
  await page.goto('https://www.twitch.tv/test');
  await page.addScriptTag({ path: resolve('dist/customPlayer.js') });
  await page.evaluate(() => {
    const player = (window as Window & { TwitchAdBlockPlayer?: { start: (token: unknown) => void } }).TwitchAdBlockPlayer!;
    player.start({ channel: 'test', value: 'local-fixture', signature: 'local-fixture' });
  });
  const host = page.locator('[data-twitch-adblock-player]');
  const shield = host.locator('[aria-live="polite"]');
  await expect(shield).toBeVisible();
  if (delayedUnmutedSettings) {
    await expect.poll(() => host.locator('video').evaluate((video: HTMLVideoElement) => video.volume)).toBe(0.4);
    await expect(host.locator('video')).toHaveJSProperty('muted', true);
  }
  adFinished = true;
  await expect(shield).toBeHidden({ timeout: 15000 });
  await expect(host.locator('select')).toContainText('360p');
  expect(await host.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0);
  await expect.poll(() => mediaRequests).toBeGreaterThan(1);
  expect(masterRequests).toBe(1);
});
}

test('plays an alternate live while the site session still has ads, then restores site HD', async ({ page }) => {
  let siteHasAd = true;
  const requestedTypes: string[] = [];
  await page.addInitScript(() => {
    Object.assign(window, { chrome: { storage: { local: { get: async () => ({ playerVolume: 0.4, playerMuted: true }) } } } });
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
    if (url.hostname === 'www.twitch.tv') return route.fulfill({ contentType: 'text/html', body: '<div data-a-target="video-player"><div style="width:640px;height:360px"><video></video></div></div>' });
    if (url.hostname === 'gql.twitch.tv') {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ headers: { ...headers, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
      const playerType = route.request().postDataJSON().variables.playerType as string;
      requestedTypes.push(playerType);
      return route.fulfill({ headers, json: { data: { streamPlaybackAccessToken: { value: playerType, signature: 'fixture' } } } });
    }
    if (url.hostname === 'usher.ttvnw.net') {
      const playerType = url.searchParams.get('token')!;
      if (playerType === 'embed') return route.fulfill({ headers, status: 403, body: '' });
      if (playerType === 'autoplay') return route.fulfill({ headers, contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\nhttps://media.test/autoplay/1080/live.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=640x360\nhttps://media.test/autoplay/360/live.m3u8\n' });
      const resolution = playerType === 'site' && !siteHasAd ? '1920x1080' : '640x360';
      return route.fulfill({ headers, contentType: 'application/vnd.apple.mpegurl', body: `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=${resolution}\nhttps://media.test/${playerType}/live.m3u8\n` });
    }
    if (url.hostname === 'media.test' && url.pathname.endsWith('/live.m3u8')) {
      const hasAd = url.pathname.startsWith('/site/') ? siteHasAd : url.pathname !== '/autoplay/360/live.m3u8';
      const segments = hasAd ? [0, 1, 2] : [3, 4, 5, 6, 7];
      const body = `#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:${segments[0]}\n#EXT-X-MAP:URI="/init.mp4"\n` + segments.map((index) => `#EXTINF:1,${hasAd ? 'stitched-ad' : ''}\n/segment${index}.m4s\n`).join('');
      return route.fulfill({ headers, contentType: 'application/vnd.apple.mpegurl', body });
    }
    if (url.hostname === 'media.test' && /^\/(init\.mp4|segment[0-7]\.m4s)$/.test(url.pathname)) return route.fulfill({ headers, contentType: 'video/mp4', body: await readFile(resolve('tests/fixtures/hls', url.pathname.slice(1))) });
    return route.abort();
  });
  await page.goto('https://www.twitch.tv/test');
  await page.addScriptTag({ path: resolve('dist/pageHook.js') });
  await page.addScriptTag({ path: resolve('dist/customPlayer.js') });
  await page.evaluate(async () => {
    const body = JSON.stringify({ operationName: 'PlaybackAccessToken', variables: { login: 'test', playerType: 'site' } });
    await fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-ID': 'fixture' }, body });
    const player = (window as Window & { TwitchAdBlockPlayer?: { start: (token: unknown) => void } }).TwitchAdBlockPlayer!;
    player.start({ channel: 'test', value: 'site', signature: 'fixture' });
  });
  const host = page.locator('[data-twitch-adblock-player]');
  const video = host.locator('video');
  await video.evaluate((node) => { node.dataset.originalInstance = 'true'; });
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThan(0);
  await expect(host.locator('[aria-live="polite"]')).toBeHidden();
  expect(siteHasAd).toBe(true);
  expect(requestedTypes).toEqual(expect.arrayContaining(['embed', 'popout', 'autoplay']));
  await expect(host.locator('select')).toContainText('360p');
  siteHasAd = false;
  // Two scheduled probes must confirm clean HD over at least ten seconds.
  await expect(host.locator('select')).toContainText('1080p', { timeout: 30000 });
  await expect(video).toHaveAttribute('data-original-instance', 'true');
  await expect(host.locator('[aria-live="polite"]')).toBeHidden();
});

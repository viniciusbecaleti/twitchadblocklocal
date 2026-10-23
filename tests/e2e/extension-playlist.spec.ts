import { chromium, test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';

test('the installed extension reads a playlist that page CORS blocks', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'twitch-playlist-test-'));
  const certPath = join(temporary, 'local-test-cert.pem');
  const keyPath = join(temporary, 'local-test-key.pem');
  // Ephemeral certificate for an HTTPS server used only by this test.
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=local-playlist-test'], { stdio: 'ignore' });
  const text = '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nlive.ts\n';
  const server = createServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, (request, response) => {
    if (request.url === '/page') {
      response.setHeader('content-type', 'text/html');
      response.end('<!doctype html><title>Playlist test</title>');
    } else {
      // Deliberately omit Access-Control-Allow-Origin.
      response.setHeader('content-type', 'application/vnd.apple.mpegurl');
      response.end(text);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const extension = resolve('dist');
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    context = await chromium.launchPersistentContext(join(temporary, 'profile'), {
      channel: 'chromium', headless: true, ignoreHTTPSErrors: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--ignore-certificate-errors', '--no-proxy-server', '--host-resolver-rules=MAP www.twitch.tv 127.0.0.1, MAP playlist.ttvnw.net 127.0.0.1'],
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`https://www.twitch.tv:${port}/page`);
    const endpoint = `https://playlist.ttvnw.net:${port}/live.m3u8`;
    const pageResult = await page.evaluate(async (url) => {
      try { return await (await fetch(url)).text(); }
      catch { return 'cors-blocked'; }
    }, endpoint);
    expect(pageResult).toBe('cors-blocked');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const reply = await popup.evaluate((url) => chrome.runtime.sendMessage({ type: 'playback:playlist', url }), endpoint);
    expect(reply).toEqual({ text });
    const denied = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'playback:playlist', url: 'https://example.com/private.m3u8' }));
    expect(denied).toEqual({ error: 'forbidden-url' });
  } finally {
    await context?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(temporary, { recursive: true, force: true });
  }
});

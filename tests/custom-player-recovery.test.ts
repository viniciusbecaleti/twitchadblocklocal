import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { instances, FakeHls } = vi.hoisted(() => {
  const instances: Array<FakeHls> = [];
  class FakeHls {
    static Events = { ERROR: 'error', LEVEL_LOADED: 'level', MANIFEST_PARSED: 'manifest', FRAG_LOADING: 'fragment-loading', FRAG_CHANGED: 'fragment-changed' };
    static ErrorDetails = { BUFFER_STALLED_ERROR: 'stalled' };
    static isSupported() { return true; }
    levels = [{ height: 360, bitrate: 600000 }];
    currentLevel = -1;
    nextAutoLevel = -1;
    listeners = new Map<string, (event: string, data: any) => void>();
    loadSource = vi.fn(); attachMedia = vi.fn(); destroy = vi.fn(); stopLoad = vi.fn(); startLoad = vi.fn();
    constructor() { instances.push(this); }
    on(event: string, listener: (event: string, data: any) => void) { this.listeners.set(event, listener); }
    emit(event: string, data = {}) { this.listeners.get(event)?.(event, data); }
  }
  return { instances, FakeHls };
});

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

it.each([360, 1080])('leaves the initial ad shield when a verified clean %ip session is available', async (height) => {
  vi.useFakeTimers();
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn().mockResolvedValue({ playerVolume: 0.4, playerMuted: false }) } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, text: async () => url.includes('usher.ttvnw.net') ? `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=${height === 360 ? '640x360' : '1920x1080'}\nhttps://media.example.test/live.m3u8` : '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:10\n#EXTINF:2,\nlive.ts\n' })));
  document.body.innerHTML = '<div data-a-target="video-player"><div><video></video></div></div>';
  await import('../src/player/custom-player');
  const player = (window as Window & { TwitchAdBlockPlayer?: { start: (token: unknown) => void; stop: () => void } }).TwitchAdBlockPlayer!;
  player.start({ channel: 'test', value: 'initial', signature: 'sig' });
  const hls = instances.at(-1)!;
  const states: string[] = [];
  const status = (event: Event) => states.push(JSON.parse((event as CustomEvent<string>).detail).state);
  const answer = (event: Event) => {
    const { channel, probeId } = JSON.parse((event as CustomEvent<string>).detail);
    window.dispatchEvent(new CustomEvent('twitch-adblock-playback-probe-result', { detail: JSON.stringify({ channel, probeId, value: 'fresh', signature: 'sig' }) }));
  };
  window.addEventListener('twitch-adblock-probe-playback-token', answer);
  window.addEventListener('twitch-adblock-custom-player-status', status);
  try {
    hls.emit('manifest');
    await vi.advanceTimersByTimeAsync(0);
    hls.emit('level', { details: { dateRanges: {}, fragments: [{ programDateTime: null, tagList: [], title: 'stitched-ad' }] } });
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toContain('ad-detected');
    expect(states).toContain('session-probe-started');
    expect(states).toContain('session-ready');
    expect(document.querySelector<HTMLElement>('[aria-live="polite"]')?.style.display).toBe('none');
    expect(document.querySelector<HTMLVideoElement>('[data-twitch-adblock-player] video')?.muted).toBe(false);
    expect(hls.loadSource.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(hls.loadSource.mock.calls[1][0]).toBe('https://media.example.test/live.m3u8');
    expect(hls.destroy).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('twitch-adblock-probe-playback-token', answer);
    window.removeEventListener('twitch-adblock-custom-player-status', status);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    player.stop();
  }
});
vi.mock('hls.js', async (original) => ({ ...await original<typeof import('hls.js')>(), default: FakeHls }));

afterEach(() => {
  (window as Window & { TwitchAdBlockPlayer?: { stop: () => void } }).TwitchAdBlockPlayer?.stop();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren();
});

it('keeps a clean 360p live visible even if token verification never answers', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn().mockResolvedValue({ playerVolume: 0.4, playerMuted: false }) } } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=640x360\nlive.m3u8' }));
  document.body.innerHTML = '<div data-a-target="video-player"><div><video></video></div></div>';
  await import('../src/player/custom-player');
  const player = (window as Window & { TwitchAdBlockPlayer?: { start: (token: unknown) => void } }).TwitchAdBlockPlayer!;
  player.start({ channel: 'test', value: 'initial', signature: 'sig' });
  const hls = instances.at(-1)!;
  const shield = document.querySelector<HTMLElement>('[aria-live="polite"]')!;
  const video = document.querySelector<HTMLVideoElement>('[data-twitch-adblock-player] video')!;
  hls.emit('manifest');
  hls.emit('level', { details: { dateRanges: {}, fragments: [{ programDateTime: null, tagList: [], title: '' }] } });
  await vi.advanceTimersByTimeAsync(60000);
  expect(shield.style.display).toBe('none');
  expect(video.muted).toBe(false);
  expect(hls.loadSource).toHaveBeenCalledTimes(1);
});

it('adopts a clean same-channel token emitted by Twitch for its native mini-player', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn().mockResolvedValue({ playerVolume: 0.4, playerMuted: false }) } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    text: async () => url.includes('usher.ttvnw.net')
      ? '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=640x360\nhttps://media.example.test/mini.m3u8'
      : '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nlive.ts\n'
  })));
  document.body.innerHTML = '<div data-a-target="video-player"><div><video></video></div></div>';
  await import('../src/player/custom-player');
  const player = (window as Window & { TwitchAdBlockPlayer?: { start: (token: unknown) => void } }).TwitchAdBlockPlayer!;
  player.start({ channel: 'test', value: 'initial-ad-token', signature: 'sig' });
  const hls = instances.at(-1)!;
  hls.emit('manifest');
  hls.emit('level', { details: { dateRanges: {}, fragments: [{ programDateTime: null, tagList: [], title: 'stitched-ad' }] } });
  player.start({ channel: 'test', value: 'native-mini-live-token', signature: 'new-sig' });
  await vi.advanceTimersByTimeAsync(0);
  expect(hls.destroy).not.toHaveBeenCalled();
  expect(hls.loadSource).toHaveBeenCalledTimes(2);
  expect(hls.loadSource.mock.calls[1][0]).toBe('https://media.example.test/mini.m3u8');
  hls.emit('fragment-loading', { frag: { type: 'main', level: 0, baseurl: 'https://media.example.test/old-ad.m3u8', title: 'stitched-ad', tagList: [], programDateTime: null } });
  hls.emit('level', { details: { url: 'https://media.example.test/old-ad.m3u8', dateRanges: {}, fragments: [{ title: 'stitched-ad', tagList: [], programDateTime: null }] } });
  expect(document.querySelector<HTMLElement>('[aria-live="polite"]')?.style.display).toBe('none');
  expect(document.querySelector<HTMLElement>('[aria-live="polite"]')?.style.display).toBe('none');
  hls.levels = [{ height: 360, bitrate: 600000 }];
  hls.emit('manifest');
  const live = { type: 'main', level: 0, programDateTime: null, tagList: [], title: '' };
  hls.emit('level', { details: { dateRanges: {}, fragments: [live] } });
  hls.emit('fragment-changed', { frag: live });
  player.start({ channel: 'test', value: 'another-native-renewal', signature: 'another-sig' });
  await vi.advanceTimersByTimeAsync(0);
  expect(hls.loadSource).toHaveBeenCalledTimes(2);
  hls.emit('fragment-loading', { frag: { ...live, title: 'stitched-ad' } });
  expect(document.querySelector<HTMLElement>('[aria-live="polite"]')?.style.display).toBe('grid');
  player.start({ channel: 'test', value: 'replacement-mini-live-token', signature: 'replacement-sig' });
  await vi.advanceTimersByTimeAsync(0);
  expect(hls.loadSource).toHaveBeenCalledTimes(3);
  expect(hls.loadSource.mock.calls[2][0]).toBe('https://media.example.test/mini.m3u8');
  expect(document.querySelector<HTMLElement>('[aria-live="polite"]')?.style.display).toBe('none');
});

it('unmasks live playback after a mid-roll without a manifest reload, native player events or a token response', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn().mockResolvedValue({ playerVolume: 0.4, playerMuted: false }) } } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\nlive.m3u8' }));
  document.body.innerHTML = '<div data-a-target="video-player"><div><video></video></div></div>';
  await import('../src/player/custom-player');
  const player = (window as Window & { TwitchAdBlockPlayer?: { start: (token: unknown) => void } }).TwitchAdBlockPlayer!;
  player.start({ channel: 'test', value: 'initial', signature: 'sig' });
  const hls = instances.at(-1)!;
  hls.levels = [{ height: 1080, bitrate: 6000000 }];
  hls.emit('manifest');
  await vi.advanceTimersByTimeAsync(0);
  const probe = vi.fn();
  window.addEventListener('twitch-adblock-probe-playback-token', probe);
  try {
    const shield = document.querySelector<HTMLElement>('[aria-live="polite"]')!;
    const video = document.querySelector<HTMLVideoElement>('[data-twitch-adblock-player] video')!;
    const ad = { type: 'main', level: 0, programDateTime: null, tagList: [], title: 'stitched-ad' };
    const live = { ...ad, title: '' };
    hls.emit('level', { details: { dateRanges: {}, fragments: [ad] } });
    hls.emit('fragment-loading', { frag: ad });
    hls.emit('fragment-changed', { frag: ad });
    expect(shield.style.display).toBe('grid');
    expect(video.muted).toBe(true);
    expect(hls.stopLoad).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(25000);
    // Recovery continues on an HD master even without new playlist events.
    expect(probe).toHaveBeenCalledTimes(8);
    hls.emit('level', { details: { dateRanges: {}, fragments: [live] } });
    expect(shield.style.display).toBe('grid'); // A clean live edge may still be ahead of buffered ads.
    hls.emit('fragment-changed', { frag: { ...live, type: 'audio' } });
    expect(shield.style.display).toBe('grid');
    hls.emit('fragment-changed', { frag: live });
    expect(shield.style.display).toBe('none');
    expect(video.muted).toBe(false);
    expect(hls.loadSource).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener('twitch-adblock-probe-playback-token', probe);
  }
});

it('detects the end of a startup ad, keeps 360p during checks, then selects HD without recreating the video', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn().mockResolvedValue({ playerVolume: 0.4, playerMuted: false }) } } });
  let improved = false;
  let adFree = false;
  const fetchManifest = vi.fn(async (url: string) => ({ ok: true, text: async () => url.includes('usher.ttvnw.net') ? `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=${improved ? '1920x1080' : '640x360'}\nhttps://media.example.test/live.m3u8` : `#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:10\n#EXTINF:2,${adFree ? '' : 'stitched-ad'}\nsegment.ts\n` }));
  vi.stubGlobal('fetch', fetchManifest);
  document.body.innerHTML = '<div data-a-target="video-player"><div><video></video></div></div>';
  await import('../src/player/custom-player');
  const player = (window as Window & { TwitchAdBlockPlayer?: { start: (token: unknown) => void; stop: () => void } }).TwitchAdBlockPlayer!;
  player.start({ channel: 'test', value: 'initial', signature: 'sig' });
  const hls = instances.at(-1)!;
  const video = document.querySelector('[data-twitch-adblock-player] video');
  const answer = (event: Event) => {
    const { channel, probeId } = JSON.parse((event as CustomEvent<string>).detail);
    // A refreshed session may legitimately have exactly the same token.
    window.dispatchEvent(new CustomEvent('twitch-adblock-playback-probe-result', { detail: JSON.stringify({ channel, probeId, value: 'initial', signature: 'sig' }) }));
  };
  window.addEventListener('twitch-adblock-probe-playback-token', answer);
  try {
    hls.emit('manifest');
    await vi.advanceTimersByTimeAsync(0);
    const dateRanges = { ad: { attr: { CLASS: 'twitch-stitched-ad' }, startDate: new Date('2026-10-23T12:00:00Z'), endDate: new Date('2026-10-23T12:00:30Z') } };
    hls.emit('level', { details: { dateRanges, fragments: [{ programDateTime: Date.parse('2026-10-23T12:00:15Z'), tagList: [] }] } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchManifest.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(hls.loadSource).toHaveBeenCalledTimes(1);
    adFree = true;
    hls.emit('level', { details: { dateRanges, fragments: [{ programDateTime: Date.parse('2026-10-23T12:00:35Z'), tagList: [] }] } });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchManifest.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(hls.loadSource).toHaveBeenCalledTimes(1);
    improved = true;
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetchManifest.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(hls.loadSource.mock.calls.length).toBeGreaterThanOrEqual(2);
    hls.levels = [{ height: 360, bitrate: 600000 }, { height: 1080, bitrate: 6000000 }];
    hls.emit('manifest');
    expect(hls.nextAutoLevel).toBe(1);
    expect(document.querySelector('[data-twitch-adblock-player] video')).toBe(video);
    expect(document.querySelector('select')?.textContent).toContain('1080p');
    const swapsAfterHd = hls.loadSource.mock.calls.length;
    await vi.advanceTimersByTimeAsync(180000);
    expect(hls.loadSource).toHaveBeenCalledTimes(swapsAfterHd);
    expect(fetchManifest.mock.calls.length).toBeGreaterThanOrEqual(6);
  } finally {
    window.removeEventListener('twitch-adblock-probe-playback-token', answer);
    // Avoid the native video's play() in the jsdom fallback.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    player.stop();
  }
});

it('after five minutes in HD switches a mid-roll to 360p and keeps it until HD media is clean', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn().mockResolvedValue({ playerVolume: 0.4, playerMuted: false }) } } });
  let phase: 'live' | 'ad' | 'hd-pending' | 'ready' = 'live';
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'usher.ttvnw.net') {
      const type = parsed.searchParams.get('token')!;
      const height = type === 'autoplay' && phase === 'ad' ? 360 : 1080;
      return { ok: true, text: async () => `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=${height === 360 ? '640x360' : '1920x1080'}\nhttps://media.example.test/${type}/${height}.m3u8` };
    }
    const clean = phase === 'live' || phase === 'ready' || parsed.pathname === '/autoplay/360.m3u8';
    return { ok: true, text: async () => `#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:10\n#EXTINF:2,${clean ? '' : 'stitched-ad'}\nsegment.ts\n` };
  }));
  document.body.innerHTML = '<div data-a-target="video-player"><div><video></video></div></div>';
  await import('../src/player/custom-player');
  const player = (window as Window & { TwitchAdBlockPlayer?: { start: (token: unknown) => void } }).TwitchAdBlockPlayer!;
  player.start({ channel: 'test', value: 'site', signature: 'sig' });
  const hls = instances.at(-1)!;
  hls.levels = [{ height: 1080, bitrate: 6000000 }];
  hls.emit('manifest');
  await vi.advanceTimersByTimeAsync(300000);
  expect(hls.loadSource).toHaveBeenCalledTimes(1);
  const video = document.querySelector<HTMLVideoElement>('[data-twitch-adblock-player] video')!;
  const shield = document.querySelector<HTMLElement>('[aria-live="polite"]')!;
  const answer = (event: Event) => {
    const { channel, probeId, playerType } = JSON.parse((event as CustomEvent<string>).detail);
    window.dispatchEvent(new CustomEvent('twitch-adblock-playback-probe-result', { detail: JSON.stringify({ channel, probeId, value: playerType, signature: 'sig' }) }));
  };
  window.addEventListener('twitch-adblock-probe-playback-token', answer);
  try {
    phase = 'ad';
    hls.emit('level', { details: { dateRanges: {}, fragments: [{ title: 'stitched-ad', tagList: [], programDateTime: null }] } });
    await vi.advanceTimersByTimeAsync(0);
    expect(hls.loadSource).toHaveBeenCalledTimes(2);
    expect(hls.loadSource.mock.calls[1][0]).toBe('https://media.example.test/autoplay/360.m3u8');
    hls.levels = [{ height: 360, bitrate: 600000 }];
    hls.emit('manifest');
    const live = { type: 'main', level: 0, title: '', tagList: [], programDateTime: null };
    hls.emit('level', { details: { dateRanges: {}, fragments: [live] } });
    hls.emit('fragment-changed', { frag: live });
    expect(shield.style.display).toBe('none');
    phase = 'hd-pending';
    // A native token refresh must not evict this working alternate session.
    player.start({ channel: 'test', value: 'new-native-token', signature: 'sig' });
    expect(hls.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30000);
    expect(hls.loadSource).toHaveBeenCalledTimes(2);
    expect(shield.style.display).toBe('none');
    expect(video.muted).toBe(false);
    expect(document.querySelector('[data-twitch-adblock-player] video')).toBe(video);
    phase = 'ready';
    await vi.advanceTimersByTimeAsync(15000);
    expect(hls.loadSource).toHaveBeenCalledTimes(3);
    hls.levels = [{ height: 360, bitrate: 600000 }, { height: 1080, bitrate: 6000000 }];
    hls.emit('manifest');
    expect(hls.nextAutoLevel).toBe(1);
    expect(shield.style.display).toBe('none');
    // A second break must invalidate the previous HD recovery and must be
    // recoverable again at the same 1080p height without a page reload.
    phase = 'ad';
    hls.emit('level', { details: { dateRanges: {}, fragments: [{ title: 'stitched-ad', tagList: [], programDateTime: null }] } });
    await vi.advanceTimersByTimeAsync(15000);
    expect(hls.loadSource).toHaveBeenCalledTimes(4);
    hls.levels = [{ height: 360, bitrate: 600000 }];
    hls.emit('manifest');
    hls.emit('level', { details: { dateRanges: {}, fragments: [live] } });
    hls.emit('fragment-changed', { frag: live });
    phase = 'ready';
    await vi.advanceTimersByTimeAsync(5000);
    expect(hls.loadSource).toHaveBeenCalledTimes(4);
    phase = 'hd-pending';
    await vi.advanceTimersByTimeAsync(10000);
    expect(hls.loadSource).toHaveBeenCalledTimes(4);
    phase = 'ready';
    await vi.advanceTimersByTimeAsync(30000);
    expect(hls.loadSource).toHaveBeenCalledTimes(5);
    expect(shield.style.display).toBe('none');
  } finally {
    window.removeEventListener('twitch-adblock-probe-playback-token', answer);
  }
});

import { AttrList, DateRange, Fragment, LevelDetails, PlaylistLevelType } from 'hls.js';
import { describe, expect, it, vi } from 'vitest';
import { adAtLiveEdge, fragmentLooksLikeAd, inspectCandidateManifest, maxHeight, QualityRecovery, StableQuality, type QualityCandidate } from '../src/player/quality-recovery';

function playlist(time: string, retainAd = true): LevelDetails {
  const details = new LevelDetails('https://example.test/live.m3u8');
  const fragment = new Fragment(PlaylistLevelType.MAIN, 'https://example.test/live.m3u8') as LevelDetails['fragments'][number];
  fragment.sn = 1;
  fragment.programDateTime = Date.parse(time);
  fragment.duration = 2;
  details.fragments = [fragment];
  if (retainAd) details.dateRanges = { ad: new DateRange(new AttrList('ID="ad",CLASS="twitch-stitched-ad",START-DATE="2026-10-23T12:00:00Z",DURATION=30')) };
  return details;
}

const candidate = (height: number): QualityCandidate => ({ height, source: `https://example.test/${height}.m3u8`, value: 'fresh-token', signature: 'signature', adFree: true });

describe('ad recovery at the live edge', () => {
  it('requires sustained HD confirmation and forgets it when ads return', () => {
    let now = 100000;
    const stability = new StableQuality(() => now);
    expect(stability.confirm(1080)).toBe(false);
    now += 3000;
    expect(stability.confirm(1080)).toBe(false);
    stability.reset();
    now += 3000;
    expect(stability.confirm(1080)).toBe(false);
    now += 10000;
    expect(stability.confirm(1080)).toBe(true);
    stability.reset();
    expect(stability.confirm(1080)).toBe(false);
  });

  it('continues recovery when the player defers an HD candidate', async () => {
    let now = 100000;
    const probe = vi.fn().mockResolvedValue(candidate(1080));
    const apply = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const recovery = new QualityRecovery(probe, apply, () => now);
    recovery.qualities(360);
    now += 10000;
    await recovery.tick();
    now += 10000;
    await recovery.tick();
    expect(apply).toHaveBeenCalledTimes(2);
    now += 60000;
    await recovery.tick();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('keeps HD confirmation separate from an alternate session still showing ads', () => {
    let now = 100000;
    const stability = new StableQuality(() => now);
    expect(stability.confirm(1080, 'site')).toBe(false);
    now += 5000;
    stability.reset('autoplay');
    now += 5000;
    expect(stability.confirm(1080, 'site')).toBe(true);
    stability.reset('site');
    expect(stability.confirm(1080, 'site')).toBe(false);
  });
  it('recognizes an ad fragment before it is requested', () => {
    expect(fragmentLooksLikeAd({ tagList: [['EXT-X-DATERANGE', 'CLASS="twitch-stitched-ad"']], title: null })).toBe(true);
    expect(fragmentLooksLikeAd({ tagList: [['INF', '2']], title: 'live content' })).toBe(false);
  });

  it('reads the actual hls.js object and ignores an expired DATERANGE still in the playlist', () => {
    expect(adAtLiveEdge(playlist('2026-10-23T12:00:15Z'))).toBe(true);
    expect(adAtLiveEdge(playlist('2026-10-23T12:00:30Z'))).toBe(false);
    expect(adAtLiveEdge(playlist('2026-10-23T12:00:35Z'))).toBe(false);
  });

  it('does not detect an old ad segment when the latest segment is regular live content', () => {
    const details = playlist('2026-10-23T12:00:35Z', false);
    const old = new Fragment(PlaylistLevelType.MAIN, 'https://example.test/live.m3u8') as LevelDetails['fragments'][number]; old.title = 'stitched-ad';
    details.fragments.unshift(old);
    expect(adAtLiveEdge(details)).toBe(false);
  });

  it('probes on ad end, keeps 360p while unavailable, then upgrades once to 1080p', async () => {
    let now = 100000;
    const probe = vi.fn().mockResolvedValueOnce({ ...candidate(360), adFree: false }).mockResolvedValueOnce(candidate(360)).mockResolvedValue(candidate(1080));
    const upgrade = vi.fn();
    const recovery = new QualityRecovery(probe, upgrade, () => now);
    recovery.qualities(360);
    recovery.ad(adAtLiveEdge(playlist('2026-10-23T12:00:15Z')));
    await recovery.tick();
    expect(probe).toHaveBeenCalledTimes(1);
    expect(upgrade).not.toHaveBeenCalled();
    recovery.ad(adAtLiveEdge(playlist('2026-10-23T12:00:35Z')));
    await recovery.tick();
    expect(probe).toHaveBeenCalledTimes(2);
    expect(upgrade).not.toHaveBeenCalled();
    now += 30000;
    await recovery.tick();
    expect(upgrade).toHaveBeenCalledExactlyOnceWith(candidate(1080));
    now += 120000;
    await recovery.tick();
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it('reacts immediately to the first ad and accepts a clean session at the same resolution', async () => {
    const probe = vi.fn().mockResolvedValue(candidate(360));
    const upgrade = vi.fn();
    const recovery = new QualityRecovery(probe, upgrade);
    recovery.qualities(360);
    recovery.ad(true);
    await recovery.tick();
    expect(upgrade).toHaveBeenCalledExactlyOnceWith(candidate(360));
  });

  it('keeps retrying when the player protects a working fallback during an ad', async () => {
    const probe = vi.fn().mockResolvedValue(candidate(1080));
    const upgrade = vi.fn().mockReturnValue(false);
    const recovery = new QualityRecovery(probe, upgrade);
    recovery.qualities(360);
    recovery.ad(true);
    await recovery.tick();
    expect(upgrade).toHaveBeenCalledExactlyOnceWith(candidate(1080));
  });

  it('also detects an ad on a 1080p stream, without repeated requests per segment', async () => {
    const probe = vi.fn().mockResolvedValue({ ...candidate(1080), adFree: false });
    const upgrade = vi.fn();
    const recovery = new QualityRecovery(probe, upgrade);
    recovery.qualities(1080);
    recovery.ad(true);
    await recovery.tick();
    for (let segment = 0; segment < 5; segment++) { recovery.ad(true); await recovery.tick(); }
    expect(probe).toHaveBeenCalledTimes(1);
    expect(upgrade).not.toHaveBeenCalled();
  });

  it('does not let an expired range hide a new ad signaled in the latest segment', () => {
    const details = playlist('2026-10-23T12:00:35Z');
    details.fragments[0].title = 'stitched-ad';
    expect(adAtLiveEdge(details)).toBe(true);
  });

  it('checks the media playlist, rather than treating a master with 1080p as ad-free', async () => {
    const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\n1080.m3u8';
    const media = '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:10\n#EXTINF:2,stitched-ad\nad.ts\n';
    const fetchMedia = vi.fn().mockResolvedValue(media);
    expect(await inspectCandidateManifest(master, 'https://example.test/master.m3u8', fetchMedia)).toEqual({ height: 1080, adFree: false });
    expect(fetchMedia).toHaveBeenCalledWith('https://example.test/1080.m3u8');
    fetchMedia.mockResolvedValue(media.replace(',stitched-ad', ','));
    expect(await inspectCandidateManifest(master, 'https://example.test/master.m3u8', fetchMedia)).toEqual({ height: 1080, adFree: true, mediaSource: 'https://example.test/1080.m3u8' });
    fetchMedia.mockResolvedValue('unavailable');
    expect((await inspectCandidateManifest(master, 'https://example.test/master.m3u8', fetchMedia)).adFree).toBeNull();
  });

  it('selects a clean 360p rendition instead of rejecting a master whose 1080p contains ads', async () => {
    const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\n1080.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=640x360\n360.m3u8';
    const fetchMedia = vi.fn(async (url: string) => `#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,${url.includes('1080') ? 'stitched-ad' : ''}\nsegment.ts\n`);
    expect(await inspectCandidateManifest(master, 'https://example.test/master.m3u8', fetchMedia)).toEqual({ height: 360, adFree: true, mediaSource: 'https://example.test/360.m3u8' });
    fetchMedia.mockClear();
    expect((await inspectCandidateManifest(master, 'https://example.test/master.m3u8', fetchMedia, true)).height).toBe(360);
    expect(fetchMedia).toHaveBeenCalledExactlyOnceWith('https://example.test/360.m3u8');
  });

  it('never treats a playable 360p ad rendition as the live fallback', async () => {
    const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\n1080.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=640x360\n360.m3u8';
    const fetchMedia = vi.fn(async (url: string) => `#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,stitched-ad\n${url}.ts\n`);
    expect(await inspectCandidateManifest(master, 'https://example.test/master.m3u8', fetchMedia, true)).toEqual({ height: 1080, adFree: false });
  });

  it('rejects HD while ads remain in the playback window even after the last segment becomes clean', async () => {
    const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\n1080.m3u8';
    const media = '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:10\n#EXTINF:2,stitched-ad\nad.ts\n#EXTINF:2,\nlive.ts\n';
    expect((await inspectCandidateManifest(master, 'https://example.test/master.m3u8', async () => media)).adFree).toBe(false);
    const cleanTail = `${media}#EXTINF:2,\nlive2.ts\n#EXTINF:2,\nlive3.ts\n`;
    expect((await inspectCandidateManifest(master, 'https://example.test/master.m3u8', async () => cleanTail)).adFree).toBe(true);
  });

  it('recovers from an initial 360p session even with no ad markers', async () => {
    let now = 100000;
    const probe = vi.fn().mockResolvedValue(candidate(1080));
    const upgrade = vi.fn();
    const recovery = new QualityRecovery(probe, upgrade, () => now);
    recovery.qualities(360);
    recovery.ad(false);
    now += 15000;
    await recovery.tick();
    expect(upgrade).toHaveBeenCalledExactlyOnceWith(candidate(1080));
  });

  it('retries immediately when the native player signals that its rendition changed', async () => {
    let now = 100000;
    const probe = vi.fn().mockResolvedValue(candidate(1080));
    const upgrade = vi.fn();
    const recovery = new QualityRecovery(probe, upgrade, () => now);
    recovery.qualities(360);
    // A normal retry would not be due for 10 seconds after MANIFEST_PARSED.
    recovery.retryNow();
    await recovery.tick();
    expect(probe).toHaveBeenCalledExactlyOnceWith();
    expect(upgrade).toHaveBeenCalledExactlyOnceWith(candidate(1080));
  });

  it('does not overlap requests or apply a response after leaving the channel', async () => {
    let resolve!: (value: QualityCandidate) => void;
    const probe = vi.fn(() => new Promise<QualityCandidate>((done) => { resolve = done; }));
    const upgrade = vi.fn();
    let now = 100000;
    const recovery = new QualityRecovery(probe, upgrade, () => now);
    recovery.qualities(360);
    now += 15000;
    const pending = recovery.tick();
    await recovery.tick();
    expect(probe).toHaveBeenCalledTimes(1);
    recovery.dispose();
    resolve(candidate(1080));
    await pending;
    expect(upgrade).not.toHaveBeenCalled();
  });

  it('does not poll a normal HD stream and does not invent quality from an error response', async () => {
    const probe = vi.fn();
    const recovery = new QualityRecovery(probe, vi.fn());
    recovery.qualities(1080);
    await recovery.tick();
    expect(probe).not.toHaveBeenCalled();
    expect(maxHeight('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\n1080.m3u8')).toBe(1080);
    expect(maxHeight('{"error":"not available"}')).toBe(0);
  });
});

import { M3U8Parser, PlaylistLevelType, type Fragment, type LevelDetails } from 'hls.js';

const adMarker = /stitched-ad|twitch-ad|scte35-out|cue-out|ad-break|amazon[-_ ]ad|x-tv-twitch-ad/i;

/** A fragment is inspected before hls.js starts its network request. */
export function fragmentLooksLikeAd(fragment: Pick<Fragment, 'tagList' | 'title'>): boolean {
  return adMarker.test(`${fragment.tagList.join(' ')} ${fragment.title ?? ''}`);
}

export function adAtLiveEdge(details: { dateRanges: LevelDetails['dateRanges']; fragments: Array<Pick<Fragment, 'tagList' | 'title' | 'programDateTime'>> }): boolean {
  const latest = details.fragments.at(-1);
  if (!latest) return false;
  // Old DATERANGEs can stay in the sliding playlist after the ad has ended.
  const edgeTime = latest.programDateTime;
  const ranges = Object.values(details.dateRanges ?? {}).filter((range) => range && adMarker.test(Object.values(range.attr).join(' ')));
  const rangeActive = ranges.some((range) => {
      if (!range) return false;
      if (edgeTime === null || !Number.isFinite(edgeTime)) return true;
      return range.startDate.getTime() <= edgeTime && (!range.endDate || range.endDate.getTime() > edgeTime);
    });
  const tags = (latest.tagList ?? []).filter(([name]) => name !== 'EXT-X-DATERANGE' && name !== 'DATERANGE');
  return rangeActive || fragmentLooksLikeAd({ tagList: tags, title: latest.title });
}

export function maxHeight(manifest: string): number {
  return Math.max(0, ...[...manifest.matchAll(/RESOLUTION=\d+x(\d+)/g)].map((match) => Number(match[1])));
}

export type QualityCandidate = { source: string; height: number; value: string; signature: string; adFree: boolean | null; playerType?: string; masterSource?: string };

/** A master can advertise HD while its media playlist still contains the same ad. */
export async function inspectCandidateManifest(manifest: string, source: string, fetchMedia: (url: string) => Promise<string>, preferLow = false): Promise<{ height: number; adFree: boolean | null; mediaSource?: string }> {
  const master = M3U8Parser.parseMasterPlaylist(manifest, source);
  const variants = master.levels.filter((level) => (level.height ?? 0) > 0).sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || b.bitrate - a.bitrate);
  const best = variants[0];
  if (!best || master.playlistParsingError) return { height: 0, adFree: null };
  const low = variants.find((level) => level.height! <= 360);
  const ordered = [...new Set(preferLow && low ? [low, ...variants] : [best, ...(low ? [low] : []), ...variants])];
  let parsed = false;
  let firstError: unknown;
  for (const variant of ordered) {
    try {
      const media = await fetchMedia(variant.url);
      if (!media.trimStart().startsWith('#EXTM3U')) continue;
      const details = M3U8Parser.parseLevelPlaylist(media, variant.url, 0, PlaylistLevelType.MAIN, 0, master.variableList);
      if (details.playlistParsingError || !details.fragments.length) continue;
      parsed = true;
      const tail = details.fragments.slice(-3);
      if (tail.every((fragment) => !adAtLiveEdge({ dateRanges: details.dateRanges, fragments: [fragment] }))) {
        // Pin the validated lower rendition. Loading its original master
        // would let ABR immediately select the HD rendition containing ads.
        return variant === best ? { height: variant.height!, adFree: true } : { height: variant.height!, adFree: true, mediaSource: variant.url };
      }
    } catch (error) { firstError ??= error; }
  }
  if (!parsed && firstError) throw firstError;
  return { height: best.height!, adFree: parsed ? false : null };
}

/** Probe on both ad transitions; switch only to a verified media playlist. */
export class QualityRecovery {
  private height = 0;
  private recovering = false;
  private adActive = false;
  private nextProbe = Infinity;
  private delay = 10000;
  private attempts = 0;
  private inFlight = false;
  private disposed = false;

  constructor(private probe: () => Promise<QualityCandidate | null>, private upgrade: (candidate: QualityCandidate) => void, private now = Date.now) {}

  qualities(height: number): void {
    this.height = height;
    if (height >= 1080 && !this.adActive) {
      this.recovering = false;
      this.nextProbe = Infinity;
    } else if (height > 0 && height <= 360 && !this.recovering) {
      this.recovering = true;
      this.nextProbe = this.now() + this.delay;
    }
  }

  ad(active: boolean): void {
    if (active !== this.adActive && (active || this.height < 1080)) {
      this.recovering = true;
      this.delay = 10000;
      this.attempts = 0;
      this.nextProbe = this.now();
    } else if (!active && this.height >= 1080) {
      this.recovering = false;
      this.nextProbe = Infinity;
    }
    this.adActive = active;
  }

  /**
   * The native Twitch player can change rendition without exposing an HLS ad
   * marker to our separate player.  Its media events are still a useful,
   * rate-limited signal that the session may have just changed.
   */
  retryNow(): void {
    if (this.disposed || this.height <= 0 || this.height >= 1080 || this.inFlight) return;
    this.recovering = true;
    this.delay = 10000;
    this.attempts = 0;
    this.nextProbe = this.now();
  }

  async tick(): Promise<void> {
    if (this.disposed || !this.recovering || this.inFlight || this.now() < this.nextProbe) return;
    this.inFlight = true;
    const started = this.now();
    try {
      const candidate = await this.probe();
      if (this.disposed) return;
      if (candidate && candidate.adFree === true && candidate.height > 0 && (candidate.height > this.height || this.adActive)) {
        this.upgrade(candidate);
        this.adActive = false;
        this.qualities(candidate.height);
        this.delay = 10000;
        this.attempts = 0;
      } else {
        this.attempts += 1;
        this.delay = this.attempts < 10 ? 10000 : Math.min(this.delay * 2, 60000);
      }
    } catch {
      this.attempts += 1;
      this.delay = this.attempts < 10 ? 10000 : Math.min(this.delay * 2, 60000);
    } finally {
      this.inFlight = false;
      // An ad-ended transition during a request schedules one follow-up probe.
      if (this.nextProbe <= started) this.nextProbe = this.now() + this.delay;
    }
  }

  dispose(): void { this.disposed = true; }
}

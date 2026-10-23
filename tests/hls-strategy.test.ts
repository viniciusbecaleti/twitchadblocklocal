import { describe, expect, it } from 'vitest';
import { inspectPlaylist } from '../src/blocking/hls-strategy';
describe('HLS inspector', () => {
  it('detects explicit stitched-ad marker without altering the playlist', () => { const data = '#EXTM3U\n#EXT-X-DATERANGE:ID="ad",CLASS="twitch-stitched-ad"\nsegment.ts'; expect(inspectPlaylist(data)).toEqual({ isAdBreak: true, markers: ['#EXT-X-DATERANGE:ID="ad",CLASS="twitch-stitched-ad"'] }); });
  it('does not treat a regular HLS discontinuity as an ad', () => expect(inspectPlaylist('#EXTM3U\n#EXT-X-DISCONTINUITY\nsegment.ts').isAdBreak).toBe(false));
});

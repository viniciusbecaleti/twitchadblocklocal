export interface HlsEvidence { isAdBreak: boolean; markers: string[]; }
const MARKERS = [/twitch-stitched-ad/i, /stitched-ad/i, /#EXT-X-CUE-OUT/i, /SCTE35-OUT/i, /X-TV-TWITCH-AD/i];
/** Observes a playlist; deliberately does not rewrite it. SSAI segments cannot safely be removed in MV3. */
export function inspectPlaylist(body: string): HlsEvidence {
  const markers = body.split('\n').filter((line) => MARKERS.some((marker) => marker.test(line))).map((line) => line.trim());
  return { isAdBreak: markers.length > 0, markers };
}

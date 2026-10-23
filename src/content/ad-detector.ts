import { inspectPlaylist } from '../blocking/hls-strategy';
export type Detection = { kind: 'hls' | 'dom'; evidence: string[] };
export function playlistDetection(body: string): Detection | null { const result = inspectPlaylist(body); return result.isAdBreak ? { kind: 'hls', evidence: result.markers } : null; }
export function overlayLooksLikeAd(element: Element): boolean {
  const text = `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.toLowerCase();
  return /(^|\s)(ad|advertisement|publicidade|anúncio)(\s|$)/i.test(text) && !/ad-free|sem anúncios/i.test(text);
}

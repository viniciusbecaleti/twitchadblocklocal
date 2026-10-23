import { overlayLooksLikeAd } from './ad-detector';
const SELECTOR = '[data-a-target*="ad"], [aria-label*="Advertisement" i], [aria-label*="Publicidade" i]';
/** Removes only standalone DOM overlays; it never touches a video or player container. */
export function cleanStandaloneOverlays(root: ParentNode = document): number {
  let removed = 0;
  root.querySelectorAll(SELECTOR).forEach((node) => {
    if (node.closest('video, [data-a-target="player-overlay-click-handler"]') || !overlayLooksLikeAd(node)) return;
    node.remove(); removed += 1;
  });
  return removed;
}

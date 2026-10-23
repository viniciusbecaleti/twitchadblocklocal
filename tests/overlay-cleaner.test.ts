import { describe, expect, it } from 'vitest';
import { cleanStandaloneOverlays } from '../src/content/overlay-cleaner';
describe('overlay cleaner', () => {
  it('removes a standalone labelled advertisement', () => { document.body.innerHTML = '<aside aria-label="Advertisement">Publicidade</aside>'; expect(cleanStandaloneOverlays()).toBe(1); expect(document.querySelector('aside')).toBeNull(); });
  it('does not remove player overlays', () => { document.body.innerHTML = '<div data-a-target="player-overlay-click-handler"><div aria-label="Advertisement">Ad</div></div>'; expect(cleanStandaloneOverlays()).toBe(0); });
});

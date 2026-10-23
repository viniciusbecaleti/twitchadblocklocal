let cleanupMonitor: (() => void) | undefined;
let observedChannel = channelFromPath();
function extensionAlive(): boolean { return Boolean(chrome.runtime?.id); }
function channelFromPath(path = location.pathname): string | null { const value = path.split('/').filter(Boolean)[0]?.toLowerCase(); return value && !['directory', 'downloads', 'settings', 'search'].includes(value) ? value : null; }
async function active(): Promise<boolean> { if (!extensionAlive()) return false; try { const settings = await chrome.storage.local.get({ enabled: true, disabledChannels: [] as string[] }); const channel = channelFromPath(); return settings.enabled && (!channel || !settings.disabledChannels.includes(channel)); } catch { return false; } }
function overlayLooksLikeAd(element: Element): boolean { const text = `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.toLowerCase(); return /(^|\s)(ad|advertisement|publicidade|anúncio)(\s|$)/i.test(text) && !/ad-free|sem anúncios/i.test(text); }
function cleanStandaloneOverlays(root: ParentNode = document): number { let removed = 0; root.querySelectorAll('[data-a-target*="ad"], [aria-label*="Advertisement" i], [aria-label*="Publicidade" i]').forEach((node) => { if (!node.closest('video, [data-a-target="player-overlay-click-handler"]') && overlayLooksLikeAd(node)) { node.remove(); removed += 1; } }); return removed; }
async function sweep(): Promise<void> { if (await active()) { const removed = cleanStandaloneOverlays(); if (removed) report('VISUAL_ADS_REMOVED', removed); } }
function report(type: string, detail?: unknown): void { if (!extensionAlive()) return; try { chrome.runtime.sendMessage({ type, detail }).catch(() => undefined); } catch { /* extension was reloaded while this tab remained open */ } }
window.addEventListener('twitch-adblock-hls', (event) => report('HLS_AD_DETECTED', (event as CustomEvent).detail));
window.addEventListener('twitch-adblock-player-type', (event) => report('PLAYER_TYPE_ALTERNATE', (event as CustomEvent).detail));
window.addEventListener('twitch-adblock-playback-token', async (event) => { const settings = await chrome.storage.local.get({ enabled: true }); if (!settings.enabled) return; try { const token = JSON.parse((event as CustomEvent<string>).detail); (window as Window & { TwitchAdBlockPlayer?: { start: (value: typeof token) => void } }).TwitchAdBlockPlayer?.start(token); report('CUSTOM_PLAYER_STARTED', token.channel); } catch { report('CUSTOM_PLAYER_FAILED', 'invalid-playback-token'); } });
window.addEventListener('twitch-adblock-custom-player-status', (event) => { try { const { state, detail } = JSON.parse((event as CustomEvent<string>).detail); report('CUSTOM_PLAYER_STATUS', `${state}${typeof detail === 'string' ? ` · ${detail}` : ''}`); } catch { report('CUSTOM_PLAYER_STATUS'); } });
function syncChannel(): void { const next = channelFromPath(); if (next && next !== observedChannel) window.dispatchEvent(new CustomEvent('twitch-adblock-channel-change', { detail: next })); observedChannel = next; }
const observer = new MutationObserver(() => { syncChannel(); void sweep(); });
observer.observe(document.documentElement, { childList: true, subtree: true });
void sweep();
const healthTimer = window.setInterval(() => { const video = document.querySelector('video'); if (!video) return; if (video.error) report('PLAYER_UNHEALTHY', `media-error-${video.error.code}`); }, 10000);
const navigationTimer = window.setInterval(syncChannel, 500);
cleanupMonitor = () => { window.clearInterval(healthTimer); window.clearInterval(navigationTimer); };
window.addEventListener('pagehide', () => { observer.disconnect(); cleanupMonitor?.(); }, { once: true });

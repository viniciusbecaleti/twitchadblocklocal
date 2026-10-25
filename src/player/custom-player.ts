import Hls, { type Fragment } from 'hls.js';
import { adAtLiveEdge, fragmentLooksLikeAd, inspectCandidateManifest, maxHeight, QualityRecovery, StableQuality, type QualityCandidate } from './quality-recovery';
import { fetchPlaylistText, PlaylistRequestError } from './playlist-request';
import { mountPlayerControls } from './player-controls';

declare const __EXTENSION_VERSION__: string;
const playerVersion = typeof __EXTENSION_VERSION__ === 'string' ? __EXTENSION_VERSION__ : 'development';

type PlaybackToken = { channel: string; value: string; signature: string; force?: boolean; playerType?: string };
type Active = { host: HTMLElement; video: HTMLVideoElement; original: HTMLVideoElement; wasMuted: boolean; volume: number; hls?: Hls; token: PlaybackToken; source: string; masterSource?: string; lowLatency: boolean; quality: number; currentHeight?: number; adLimited?: boolean; masterProbe?: number; lastRecovery: number; cleanup?: () => void; applyAudioSettings?: () => void; considerToken?: (token: PlaybackToken) => void };
let active: Active | undefined;
let preferredVolume = 1;
let preferredMuted = false;
let persistTimer: number | undefined;
void chrome.storage.local.get({ playerVolume: 1, playerMuted: false }).then((stored) => { preferredVolume = Math.min(1, Math.max(0, Number(stored.playerVolume))); preferredMuted = Boolean(stored.playerMuted); if (active) { active.video.volume = preferredVolume; if (active.applyAudioSettings) active.applyAudioSettings(); else active.video.muted = preferredMuted; } }).catch(() => undefined);
function persistVolume(video: HTMLVideoElement): void { preferredVolume = video.volume; preferredMuted = video.muted; if (persistTimer) clearTimeout(persistTimer); persistTimer = window.setTimeout(() => { void chrome.storage.local.set({ playerVolume: preferredVolume, playerMuted: preferredMuted }); }, 180); }
const sourceFor = ({ channel, value, signature }: PlaybackToken) => `https://usher.ttvnw.net/api/channel/hls/${encodeURIComponent(channel)}.m3u8?${new URLSearchParams({ acmb: 'e30=', allow_source: 'true', fast_bread: 'true', playlist_include_framerate: 'true', reassignments_supported: 'true', supported_codecs: 'avc1', player: 'twitchweb', p: String(Math.floor(Math.random() * 1e6)), sig: signature, token: value })}`;
function refreshedSource(source: string): string { const url = new URL(source); url.searchParams.set('p', String(Math.floor(Math.random() * 1e9))); url.searchParams.set('twitch-adblock-probe', String(Date.now())); return url.toString(); }
const formatTime = (s: number) => Number.isFinite(s) ? `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}` : 'AO VIVO';
function silenceOriginalMedia(target?: EventTarget | null): void { if (active && target instanceof HTMLVideoElement && target !== active.video) { target.muted = true; target.volume = 0; } }
document.addEventListener('play', (event) => silenceOriginalMedia(event.target), true); document.addEventListener('volumechange', (event) => silenceOriginalMedia(event.target), true);
function discardActive(): Active | undefined { const previous = active; if (!previous) return undefined; if (previous.masterProbe) clearInterval(previous.masterProbe); previous.cleanup?.(); previous.hls?.destroy(); previous.host.remove(); active = undefined; return previous; }
function restore(reason: string): void { const previous = discardActive(); if (!previous) return; const { original, wasMuted, volume } = previous; original.style.visibility = ''; original.muted = wasMuted; original.volume = volume; original.play().catch(() => undefined); window.dispatchEvent(new CustomEvent('twitch-adblock-custom-player-status', { detail: JSON.stringify({ state: 'fallback', reason }) })); }
function mount(token: PlaybackToken, lowLatency = true, quality = -1): void {
  // Native token refreshes must not replace a working alternate live session.
  if (!token.force && active?.token.channel === token.channel) { active.considerToken?.(token); return; } discardActive();
  const source = sourceFor(token);
  const original = document.querySelector<HTMLVideoElement>('[data-a-target="video-player"] video, video'); const container = original?.parentElement?.parentElement; if (!original || !container) return;
  const host = document.createElement('section'); host.dataset.twitchAdblockPlayer = 'true'; host.style.cssText = 'position:absolute;inset:0;z-index:20;background:#000;color:#fff;font:13px Roboto,Arial,sans-serif;overflow:hidden';
  host.dataset.twitchAdblockVersion = playerVersion;
  host.dataset.adProtection = 'inactive';
  if (!document.getElementById('twitch-adblock-layout-style')) { const style = document.createElement('style'); style.id = 'twitch-adblock-layout-style'; style.textContent = '.twitch-adblock-chat-hidden [data-a-target="right-column"],.twitch-adblock-chat-hidden .right-column{display:none!important}.twitch-adblock-chat-hidden [data-a-target="video-player"]{width:100%!important;max-width:none!important}'; document.head.append(style); }
  const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.volume = preferredVolume; video.muted = preferredMuted; video.style.cssText = 'width:100%;height:100%;background:#000;display:block';
  const svg = (path: string) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
  const icons = { play: 'M8 5v14l11-7z', pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z', back: 'M11 8V5l-5 5 5 5v-3c3.31 0 6 1.08 8 4-1-5-4-8-8-8z', forward: 'M13 8V5l5 5-5 5v-3c-3.31 0-6 1.08-8 4 1-5 4-8 8-8z', volume: 'M3 10v4h4l5 4V6L7 10H3zm12.5 2c0-1.18-.68-2.2-1.67-2.7v5.39A2.99 2.99 0 0015.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z', mute: 'M16.5 12c0-1.18-.68-2.2-1.67-2.7v1.78l1.65 1.65c.01-.24.02-.49.02-.73zM19 12c0 .82-.15 1.61-.41 2.34l1.23 1.23A6.98 6.98 0 0021 12c0-3.17-2.11-5.85-5-6.71v2.06A4.99 4.99 0 0119 12zM4.27 3 3 4.27 7.73 9H3v4h4l5 4v-5.73l4.25 4.25A5.04 5.04 0 0114 16.65v2.06c1.09-.25 2.08-.79 2.88-1.54L19.73 20 21 18.73 4.27 3zM12 6 9.91 7.67 12 9.76V6z', gear: 'M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65-2-3.46-2.49 1a7.38 7.38 0 00-1.69-.98L15 3h-4l-.37 2.95c-.61.25-1.18.58-1.69.98l-2.49-1-2 3.46 2.11 1.65c-.04.32-.07.65-.07.98s.02.66.07.98L4.45 14.65l2 3.46 2.49-1c.51.4 1.08.73 1.69.98L11 21h4l.37-2.95c.61-.25 1.18-.58 1.69-.98l2.49 1 2-3.46-2.11-1.63zM13 16.5A4.5 4.5 0 1113 7a4.5 4.5 0 010 9.5z', fullscreen: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zm-3-12v2h3v3h2V5h-5z', chat: 'M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z' };
  const controls = document.createElement('div'); controls.style.cssText = 'position:absolute;z-index:2;inset:auto 0 0;padding:46px 12px 9px;background:linear-gradient(transparent,rgba(0,0,0,.9));display:grid;gap:5px;opacity:1;pointer-events:auto;transition:opacity 1000ms ease';
  const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:6px;height:36px'; const btn = (icon: string, title: string) => { const b = document.createElement('button'); b.innerHTML = icon; b.title = title; b.setAttribute('aria-label', title); b.style.cssText = 'display:grid;place-items:center;border:0;background:transparent;color:#fff;cursor:pointer;padding:6px;border-radius:2px'; b.onmouseenter = () => b.style.background = 'rgba(255,255,255,.15)'; b.onmouseleave = () => b.style.background = 'transparent'; return b; };
  const play = btn(svg(icons.play), 'Reproduzir'); const mute = btn(svg(icons.volume), 'Silenciar'); const volumeBox = document.createElement('div'); volumeBox.style.cssText = 'display:flex;align-items:center;overflow:hidden;width:0;opacity:0;transition:width 180ms ease,opacity 140ms ease'; const volumeSlider = document.createElement('input'); volumeSlider.type = 'range'; volumeSlider.min = '0'; volumeSlider.max = '100'; volumeSlider.value = '100'; volumeSlider.setAttribute('aria-label', 'Volume'); volumeSlider.style.cssText = 'width:76px;margin:0 7px 0 2px;accent-color:#fff;cursor:pointer'; volumeBox.append(volumeSlider); const volumeGroup = document.createElement('div'); volumeGroup.style.cssText = 'display:flex;align-items:center;border-radius:18px;transition:background 180ms ease'; volumeGroup.append(mute, volumeBox); const spacer = document.createElement('span'); spacer.style.flex = '1'; const qualityMenu = document.createElement('select'); qualityMenu.title = 'Qualidade'; qualityMenu.style.cssText = 'background:transparent;border:0;color:#ddd;font:13px Roboto,Arial,sans-serif;padding:4px;text-align:right;cursor:pointer'; qualityMenu.append(new Option('Automática', '-1')); const latency = document.createElement('button'); latency.title = 'Alternar baixa latência'; latency.setAttribute('aria-label', 'Baixa latência'); latency.setAttribute('role', 'switch'); latency.style.cssText = 'position:relative;width:38px;height:22px;border:0;border-radius:999px;background:#5f6368;cursor:pointer;padding:0;transition:background 160ms ease'; const latencyKnob = document.createElement('span'); latencyKnob.style.cssText = 'position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.45);transition:transform 160ms ease'; latency.append(latencyKnob); const settings = btn(svg(icons.gear), 'Configurações'); const fullscreen = btn(svg(icons.fullscreen), 'Tela cheia');
  settings.title = `Configurações · v${playerVersion}`;
  const settingsPanel = document.createElement('div'); settingsPanel.style.cssText = 'display:none;position:absolute;right:12px;bottom:56px;width:285px;padding:8px;background:rgba(15,15,15,.96);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.48);backdrop-filter:blur(12px);z-index:2'; const settingsRow = (label: string, detail: HTMLElement) => { const item = document.createElement('div'); item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;min-height:42px;padding:0 9px;border-radius:7px'; const text = document.createElement('span'); text.textContent = label; text.style.cssText = 'font:14px Roboto,Arial,sans-serif'; item.append(text, detail); item.onmouseenter = () => item.style.background = 'rgba(255,255,255,.08)'; item.onmouseleave = () => item.style.background = 'transparent'; return item; }; settingsPanel.append(settingsRow('Qualidade', qualityMenu), settingsRow('Baixa latência', latency));
  row.append(play, volumeGroup, spacer, settings, fullscreen); controls.append(row);
  // The original DOM controls stay mounted only as an adapter for the stable
  // playback logic below. The visible interface is rendered by React.
  controls.style.display = 'none'; settingsPanel.style.display = 'none';
  const reactMount = document.createElement('div'); reactMount.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none';
  host.append(video, controls, settingsPanel, reactMount);
  const cleanup: Array<() => void> = [];
  const wasMuted = original.muted; const volume = original.volume; if (getComputedStyle(container).position === 'static') container.style.position = 'relative'; container.append(host); original.muted = true; original.volume = 0; active = { host, video, original, wasMuted, volume, token, source, lowLatency, quality, lastRecovery: 0, cleanup: () => cleanup.forEach((stop) => stop()) };
  const reactControls = mountPlayerControls(reactMount, {
    video, host, version: playerVersion,
    getQualityOptions: () => Array.from(qualityMenu.options).map((option) => ({ value: Number(option.value), label: option.text })),
    getQuality: () => active?.quality ?? -1,
    getLowLatency: () => Boolean(active?.lowLatency),
    getResolutionLabel: () => active?.currentHeight ? `${active.currentHeight}p` : null,
    isAdLimited: () => Boolean(active?.adLimited),
    onQualityChange: (nextQuality) => { qualityMenu.value = String(nextQuality); qualityMenu.dispatchEvent(new Event('change')); },
    onLowLatencyChange: () => latency.click(),
    onPersistVolume: () => persistVolume(video)
  });
  cleanup.push(() => reactControls.destroy());
  const fail = (reason: string) => restore(reason); if (Hls.isSupported()) { const hls = new Hls({ lowLatencyMode: lowLatency, liveSyncDurationCount: lowLatency ? 2 : 4, liveMaxLatencyDurationCount: lowLatency ? 5 : 10, backBufferLength: 30 }); active.hls = hls;
    const recoverAtLive = (reason: string) => { if (!active || active.hls !== hls || Date.now() - active.lastRecovery < 8000) return; active.lastRecovery = Date.now(); hls.stopLoad(); hls.loadSource(active.source); hls.startLoad(-1); window.dispatchEvent(new CustomEvent('twitch-adblock-custom-player-status', { detail: JSON.stringify({ state: 'stream-recovered', reason }) })); };
    hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) fail(`hls-${data.type}`); else if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) recoverAtLive('buffer-stalled'); });
    let cancelProbe: (() => void) | undefined;
    let restoredQuality = false;
    let selectedHeight: number | undefined;
    let masterUpgradePending = false;
    let masterUpgradeTimeout: number | undefined;
    let attemptedMasterHeight = 0;
    let masterProbeInFlight = false;
    let verifiedMediaHeight: number | undefined;
    const masterProbeAbort = new AbortController();
    let adDetected = false;
    // This remains latched while an alternate 360p session is playing live.
    // A clean fallback does not mean that the site's ad break has ended.
    let adBreakActive = false;
    let adShieldVisible = false;
    let displayingLowFallback = false;
    let cleanEdgeAvailable = false;
    let cleanPlaybackSince: number | undefined;
    const stableQuality = new StableQuality();
    let mutedBeforeShield: boolean | undefined;
    const shieldAd = (show: boolean) => {
      if (show === adShieldVisible) return;
      adShieldVisible = show;
      host.dataset.adProtection = show ? 'active' : 'inactive';
      // Protection is deliberately state-only: never cover the current
      // picture with a waiting/error screen while replacement sessions are
      // checked in the background. HLS must keep running so it can deliver
      // the ad-ended transition and the visible video stays continuous.
      if (show && mutedBeforeShield === undefined) {
        mutedBeforeShield = video.muted;
        video.muted = true;
        video.play()?.catch(() => undefined);
      } else if (!show && mutedBeforeShield !== undefined) {
        video.muted = mutedBeforeShield;
        mutedBeforeShield = undefined;
      }
    };
    active.applyAudioSettings = () => {
      if (adShieldVisible) mutedBeforeShield = preferredMuted;
      video.muted = adShieldVisible || preferredMuted;
    };
    const resumeLive = () => { hls.startLoad(-1); video.play()?.catch(() => undefined); };
    const probeStatus = (state: string, detail?: string) => window.dispatchEvent(new CustomEvent('twitch-adblock-custom-player-status', { detail: JSON.stringify({ state, detail }) }));
    const probeSession = () => new Promise<QualityCandidate | null>((resolve) => {
      probeStatus('session-probe-started');
      // A fresh token for the same site entitlement can contain the same ad.
      // Race independently verified alternate entitlements during the break;
      // query the normal site entitlement later to restore source quality.
      // Keep the regular site entitlement in the race too. During some ad
      // transitions it is the only one that exposes Twitch's low rendition
      // (the same 360p used by the native mini-player), while the alternate
      // entitlements can legitimately be rejected.
      const playerTypes = adBreakActive && !displayingLowFallback ? ['site', 'embed', 'popout', 'autoplay'] : ['site'];
      const pending = new Map<string, string>(playerTypes.map((playerType) => [crypto.randomUUID(), playerType]));
      const abort = new AbortController();
      let done = false;
      const finish = (candidate: QualityCandidate | null) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        abort.abort();
        window.removeEventListener('twitch-adblock-playback-probe-result', receive);
        cancelProbe = undefined;
        probeStatus(!candidate ? 'session-probe-unavailable' : candidate.adFree === false ? 'session-still-ad' : candidate.adFree === null ? 'session-unverified' : 'session-ready');
        resolve(candidate);
      };
      const receive = async (event: Event) => {
        let probeId: string | undefined;
        let playerType: string | undefined;
        let stage = 'token';
        try {
          const candidate = JSON.parse((event as CustomEvent<string>).detail) as PlaybackToken & { probeId?: string; error?: string };
          if (!candidate.probeId || !pending.has(candidate.probeId) || candidate.channel !== token.channel) return;
          probeId = candidate.probeId;
          playerType = pending.get(probeId)!;
          if (candidate.error) throw new PlaylistRequestError(candidate.error);
          if (typeof candidate.value !== 'string' || typeof candidate.signature !== 'string') throw new PlaylistRequestError('invalid-token');
          const nextSource = sourceFor(candidate);
          stage = 'master';
          const manifest = await fetchPlaylistText(nextSource, abort.signal);
          const inspected = await inspectCandidateManifest(manifest, nextSource, async (url) => {
            stage = 'media';
            return fetchPlaylistText(url, abort.signal);
          }, adBreakActive && !displayingLowFallback);
          if (inspected.adFree === true) {
            finish({ ...inspected, source: inspected.mediaSource ?? nextSource, masterSource: nextSource, value: candidate.value, signature: candidate.signature, playerType });
          } else if (!done) { stableQuality.reset(playerType); probeStatus('candidate-rejected', `${playerType}: ${inspected.adFree === false ? 'ad-present' : 'unverified-playlist'}`); }
        } catch (error) {
          if (!done && playerType) probeStatus('candidate-failed', `${playerType}: ${stage}-${error instanceof PlaylistRequestError ? error.code : 'network-error'}`);
        }
        finally {
          if (probeId) pending.delete(probeId);
          if (!pending.size) finish(null);
        }
      };
      const timeout = window.setTimeout(() => {
        for (const playerType of pending.values()) probeStatus('candidate-failed', `${playerType}: request-timeout`);
        finish(null);
      }, 12000);
      cancelProbe = () => finish(null);
      window.addEventListener('twitch-adblock-playback-probe-result', receive);
      for (const [probeId, playerType] of pending) window.dispatchEvent(new CustomEvent('twitch-adblock-probe-playback-token', { detail: JSON.stringify({ channel: token.channel, probeId, playerType }) }));
    });
    const applyCandidate = (candidate: QualityCandidate) => {
      if (!active || active.hls !== hls || masterUpgradePending) return false;
      // During a break only the original site entitlement can confirm the
      // return to HD. Alternate-session HD is not an ad-ended signal.
      if (adBreakActive && displayingLowFallback && candidate.height > 360 && candidate.playerType !== 'site') return false;
      // Keep a working fallback stable. If playback is shielded, however,
      // a verified clean HD rendition is also a valid way out of the ad.
      if (displayingLowFallback && adDetected && !cleanEdgeAvailable && candidate.height > 360) return false;
      const currentHeight = Math.max(0, ...hls.levels.map((level) => level.height || verifiedMediaHeight || 0));
      // Once the clean 360p mini-player session is running, fresh native
      // tokens for the same/lower quality are only renewals. Reloading them
      // makes the player flash the waiting shield without improving playback.
      if (displayingLowFallback && candidate.height <= Math.max(360, currentHeight)) return false;
      if (!adShieldVisible && candidate.height > 360 && currentHeight <= 360 && !stableQuality.confirm(candidate.height, candidate.playerType ?? 'site')) return false;
      if (candidate.height > 360 && candidate.playerType === 'site') adBreakActive = false;
      masterUpgradePending = true;
      masterUpgradeTimeout = window.setTimeout(() => { masterUpgradePending = false; }, 15000);
      selectedHeight = active.quality >= 0 ? hls.levels[active.quality]?.height || verifiedMediaHeight : undefined;
      active.token = { channel: token.channel, value: candidate.value, signature: candidate.signature, playerType: candidate.playerType };
      active.source = candidate.source;
      active.masterSource = candidate.masterSource ?? candidate.source;
      verifiedMediaHeight = candidate.source !== active.masterSource ? candidate.height : undefined;
      displayingLowFallback = candidate.adFree === true && candidate.height <= 360;
      active.currentHeight = candidate.height;
      active.adLimited = displayingLowFallback;
      reactControls.refresh();
      // Loading a validated playlist is not proof that its media is already
      // on screen. Keep the internal protection state until playback confirms
      // a clean window, without covering the video while that happens.
      cleanEdgeAvailable = false;
      cleanPlaybackSince = undefined;
      restoredQuality = true;
      attemptedMasterHeight = 0;
      hls.loadSource(candidate.source);
      resumeLive();
      window.dispatchEvent(new CustomEvent('twitch-adblock-custom-player-status', { detail: JSON.stringify({ state: 'quality-restored', height: candidate.height }) }));
      return true;
    };
    const recovery = new QualityRecovery(probeSession, applyCandidate, Date.now, () => displayingLowFallback ? 10000 : 60000);
    let nativeCandidateInFlight = false;
    active.considerToken = (candidateToken) => {
      if (nativeCandidateInFlight || !active || active.hls !== hls || (candidateToken.value === active.token.value && candidateToken.signature === active.token.signature)) return;
      nativeCandidateInFlight = true;
      void (async () => {
        try {
          const nextSource = sourceFor(candidateToken);
          const manifest = await fetchPlaylistText(nextSource, masterProbeAbort.signal);
          const inspected = await inspectCandidateManifest(manifest, nextSource, (url) => fetchPlaylistText(url, masterProbeAbort.signal), adBreakActive && !displayingLowFallback);
          if (inspected.adFree !== true || !active || active.hls !== hls) return;
          probeStatus('native-live-session', `${inspected.height}p`);
          applyCandidate({ ...inspected, source: inspected.mediaSource ?? nextSource, masterSource: nextSource, value: candidateToken.value, signature: candidateToken.signature, playerType: candidateToken.playerType ?? 'site' });
        } catch { /* Native refreshes are advisory; scheduled probes continue. */ }
        finally { nativeCandidateInFlight = false; }
      })();
    };
    cleanup.push(() => { recovery.dispose(); cancelProbe?.(); masterProbeAbort.abort(); if (masterUpgradeTimeout) clearTimeout(masterUpgradeTimeout); });
    let reportedAd = false;
    const blockAd = (reason: string) => {
      if (!active || active.hls !== hls) return;
      const newlyBlocked = !adDetected;
      adDetected = true;
      adBreakActive = true;
      cleanEdgeAvailable = false;
      cleanPlaybackSince = undefined;
      stableQuality.reset();
      attemptedMasterHeight = 0;
      // The fallback is no longer safe once its own playlist contains ads.
      // Invalidate it so another clean 360p session can replace it too.
      displayingLowFallback = false;
      masterUpgradePending = false;
      if (masterUpgradeTimeout) clearTimeout(masterUpgradeTimeout);
      const currentHeight = Math.max(0, ...hls.levels.map((level) => level.height || verifiedMediaHeight || 0));
      if (active) {
        active.currentHeight = currentHeight || active.currentHeight;
      }
      if (active) active.adLimited = currentHeight > 0 && currentHeight <= 360;
      reactControls.refresh();
      shieldAd(true);
      recovery.ad(true);
      void recovery.tick();
      if (newlyBlocked) probeStatus('ad-blocked', reason);
    };
    const isAdFragment = (frag: Fragment) => {
      const details = hls.levels[frag.level]?.details;
      // Evaluate DATERANGEs against this fragment's timestamp. A tag can
      // remain in the playlist long after its advertising range has ended.
      return details ? adAtLiveEdge({ dateRanges: details.dateRanges, fragments: [frag] }) : fragmentLooksLikeAd(frag);
    };
    const isCurrentFragment = (frag: Fragment) => !verifiedMediaHeight || !frag.baseurl || frag.baseurl === active?.source;
    hls.on(Hls.Events.FRAG_LOADING, (_event, data) => {
      if (data.frag.type === 'main' && isCurrentFragment(data.frag) && isAdFragment(data.frag)) blockAd('fragment-marker');
    });
    hls.on(Hls.Events.FRAG_CHANGED, (_event, data) => {
      if (data.frag.type !== 'main' || !isCurrentFragment(data.frag)) return;
      if (isAdFragment(data.frag)) {
        blockAd('playing-fragment-marker');
      } else if (adDetected && cleanEdgeAvailable && cleanPlaybackSince !== undefined && Date.now() - cleanPlaybackSince >= 3000) {
        // Release the shield when actual live video reaches playback, even
        // when the token, master playlist and resolution stay unchanged.
        shieldAd(false);
        adDetected = false;
        if (!displayingLowFallback) adBreakActive = false;
        reactControls.refresh();
        recovery.ad(false);
        probeStatus('live-resumed');
      }
    });
    hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
      if (verifiedMediaHeight && data.details.url && data.details.url !== active?.source) return;
      const detected = adAtLiveEdge(data.details);
      if (detected !== reportedAd) {
        reportedAd = detected;
        window.dispatchEvent(new CustomEvent('twitch-adblock-custom-player-status', { detail: JSON.stringify({ state: detected ? 'ad-detected' : 'ad-ended' }) }));
        if (detected) window.dispatchEvent(new CustomEvent('twitch-adblock-hls', { detail: { source: 'custom-player', state: 'ad-detected' } }));
      }
      if (detected) {
        blockAd('playlist-marker');
      } else {
        cleanEdgeAvailable = data.details.fragments.length > 0;
        if (cleanEdgeAvailable) cleanPlaybackSince ??= Date.now();
        recovery.ad(false);
      }
      if (!detected) void recovery.tick();
    });
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (!active || active.hls !== hls) return;
      const wasRestored = restoredQuality;
      masterUpgradePending = false;
      if (masterUpgradeTimeout) clearTimeout(masterUpgradeTimeout);
      qualityMenu.replaceChildren(new Option('Automática', '-1'));
      hls.levels.forEach((level, index) => { const height = level.height || verifiedMediaHeight; qualityMenu.append(new Option(height ? `${height}p` : `${Math.round(level.bitrate / 1000)} kbps`, String(index))); });
      if (selectedHeight !== undefined) active.quality = hls.levels.findIndex((level) => (level.height || verifiedMediaHeight) === selectedHeight);
      hls.currentLevel = active.quality;
      qualityMenu.value = String(active.quality);
      const currentMax = Math.max(0, ...hls.levels.map((level) => level.height || verifiedMediaHeight || 0));
      active.currentHeight = currentMax || active.currentHeight;
      active.adLimited = displayingLowFallback || (adDetected && currentMax > 0 && currentMax <= 360);
      reactControls.refresh();
      if (wasRestored && active.quality === -1 && hls.levels.length) {
        const best = hls.levels.reduce((index, level, next) => level.height > hls.levels[index].height || (level.height === hls.levels[index].height && level.bitrate > hls.levels[index].bitrate) ? next : index, 0);
        hls.nextAutoLevel = best;
      }
      restoredQuality = false;
      recovery.qualities(currentMax);
      // Resolution alone is not evidence of an ad. A 360p-only live remains
      // visible while QualityRecovery checks for a higher-quality session.
    });
    hls.loadSource(source); hls.attachMedia(video);
    const checkMaster = async () => {
      if (!active || active.hls !== hls || document.hidden) return;
      // End-of-break checks run against fresh site tokens in the background.
      // Do not reload the fallback's master or try its HD during the break.
      if (adBreakActive && displayingLowFallback) { void recovery.tick(); return; }
      // Recovery may look for a clean low fallback during the break, but HD
      // upgrades wait for the ad-ended transition.
      if (adDetected && !cleanEdgeAvailable) { void recovery.tick(); return; }
      void recovery.tick();
      if (masterUpgradePending || masterProbeInFlight) return;
      const currentMax = Math.max(0, ...hls.levels.map((level) => level.height || verifiedMediaHeight || 0));
      if (!currentMax || currentMax >= 1080) return;
      masterProbeInFlight = true;
      try {
        const checkedSource = active.source;
        const freshSource = refreshedSource(active.masterSource ?? checkedSource);
        const manifest = await fetchPlaylistText(freshSource, masterProbeAbort.signal);
        const availableMax = maxHeight(manifest);
        if (!active || active.hls !== hls) return;
        const latestMax = Math.max(0, ...hls.levels.map((level) => level.height || verifiedMediaHeight || 0));
        if (availableMax > latestMax && availableMax > attemptedMasterHeight) {
          const inspected = await inspectCandidateManifest(manifest, freshSource, async (url) => {
            return fetchPlaylistText(url, masterProbeAbort.signal);
          });
          // Keep the alternate live playing until the higher-quality media
          // is clean too. A master advertising HD is not enough to switch.
          if (inspected.adFree !== true) { stableQuality.reset(active?.token.playerType ?? 'site'); return; }
          if (inspected.height <= latestMax || !active || active.hls !== hls || active.source !== checkedSource || masterUpgradePending || (adDetected && !cleanEdgeAvailable)) return;
          if (!stableQuality.confirm(inspected.height, active.token.playerType ?? 'site')) return;
          active.source = inspected.mediaSource ?? freshSource;
          active.masterSource = freshSource;
          verifiedMediaHeight = inspected.mediaSource ? inspected.height : undefined;
          displayingLowFallback = false;
          active.currentHeight = inspected.height;
          active.adLimited = false;
          reactControls.refresh();
          restoredQuality = true;
          attemptedMasterHeight = inspected.height;
          masterUpgradePending = true;
          masterUpgradeTimeout = window.setTimeout(() => { masterUpgradePending = false; }, 15000);
          recovery.ad(false);
          recovery.qualities(inspected.height);
          hls.loadSource(active.source);
          resumeLive();
          window.dispatchEvent(new CustomEvent('twitch-adblock-custom-player-status', { detail: JSON.stringify({ state: 'master-quality-restored', height: availableMax }) }));
          return;
        }
      } catch { /* A token refresh remains available as the fallback below. */ }
      finally { masterProbeInFlight = false; }
      void recovery.tick();
    };
    // During a stitched ad Twitch's original player is still alive behind our
    // overlay.  When its mini-player disappears it normally emits one of
    // these loading events as it returns to the live rendition.  Do not rely
    // solely on playlist ad markers: force a fresh token/manifest check on
    // that transition, with a short debounce to avoid a request storm.
    let nativeTransitionTimer: number | undefined;
    let lastNativeTransition = 0;
    const nativeTransition = () => {
      if (!active || active.hls !== hls || Date.now() - lastNativeTransition < 1500) return;
      if (adBreakActive && displayingLowFallback) return;
      if (adDetected && !cleanEdgeAvailable) return;
      const currentMax = Math.max(0, ...hls.levels.map((level) => level.height || verifiedMediaHeight || 0));
      if (currentMax >= 1080) return;
      lastNativeTransition = Date.now();
      if (nativeTransitionTimer) clearTimeout(nativeTransitionTimer);
      nativeTransitionTimer = window.setTimeout(() => {
        nativeTransitionTimer = undefined;
        recovery.retryNow();
        void checkMaster();
      }, 300);
    };
    const nativeEvents = ['loadedmetadata', 'loadeddata', 'canplay', 'playing', 'emptied'];
    nativeEvents.forEach((event) => original.addEventListener(event, nativeTransition));
    cleanup.push(() => {
      if (nativeTransitionTimer) clearTimeout(nativeTransitionTimer);
      nativeEvents.forEach((event) => original.removeEventListener(event, nativeTransition));
    });
    active.masterProbe = window.setInterval(() => void checkMaster(), 5000);
    void checkMaster();
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = source; else fail('hls-not-supported');
  const update = () => { play.innerHTML = svg(video.paused ? icons.play : icons.pause); mute.innerHTML = svg(video.muted || !video.volume ? icons.mute : icons.volume); volumeSlider.value = String(Math.round((video.muted ? 0 : video.volume) * 100)); const enabled = Boolean(active?.lowLatency); latency.setAttribute('aria-checked', String(enabled)); latency.style.background = enabled ? '#fff' : '#5f6368'; latencyKnob.style.transform = enabled ? 'translateX(16px)' : 'translateX(0)'; latencyKnob.style.background = enabled ? '#000' : '#fff'; }; ['play', 'pause', 'volumechange'].forEach((event) => video.addEventListener(event, update)); update();
  play.onclick = () => video.paused ? video.play().catch(() => undefined) : video.pause(); mute.onclick = () => { video.muted = !video.muted; persistVolume(video); }; volumeSlider.oninput = () => { video.volume = Number(volumeSlider.value) / 100; video.muted = video.volume === 0; persistVolume(video); }; volumeGroup.addEventListener('mouseenter', () => { volumeGroup.style.background = 'rgba(0,0,0,.68)'; volumeBox.style.width = '88px'; volumeBox.style.opacity = '1'; }); volumeGroup.addEventListener('mouseleave', () => { volumeGroup.style.background = 'transparent'; volumeBox.style.width = '0'; volumeBox.style.opacity = '0'; });
  const closeSettings = () => { settingsPanel.style.display = 'none'; }; const outsideSettings = (event: PointerEvent) => { const target = event.target; if (settingsPanel.style.display !== 'none' && target instanceof Node && !settingsPanel.contains(target) && !settings.contains(target)) closeSettings(); }; document.addEventListener('pointerdown', outsideSettings);
  cleanup.push(() => document.removeEventListener('pointerdown', outsideSettings));
  qualityMenu.onchange = () => { if (active?.hls) { active.quality = Number(qualityMenu.value); active.hls.currentLevel = active.quality; } }; latency.onclick = () => { if (active) { const { token: next, quality: q } = active; mount({ ...next, force: true }, !active.lowLatency, q); } }; settings.onclick = () => { settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none'; }; fullscreen.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else host.requestFullscreen().catch(() => undefined); };
  let timer: number | undefined; let interacting = false;
  const showControls = () => { if (timer) clearTimeout(timer); controls.style.transition = 'opacity 0ms'; controls.style.opacity = '1'; controls.style.pointerEvents = 'auto'; if (!interacting && !video.paused) timer = window.setTimeout(hideControls, 2000); };
  const hideControls = () => { if (!interacting && !video.paused) { controls.style.transition = 'opacity 1000ms ease'; controls.style.opacity = '0'; controls.style.pointerEvents = 'none'; } };
  host.addEventListener('mousemove', showControls); host.addEventListener('mouseenter', showControls); host.addEventListener('mouseleave', () => { interacting = false; if (timer) clearTimeout(timer); timer = window.setTimeout(hideControls, 2000); });
  controls.addEventListener('mouseenter', () => { interacting = true; if (timer) clearTimeout(timer); controls.style.opacity = '1'; controls.style.pointerEvents = 'auto'; });
  controls.addEventListener('mouseleave', () => { interacting = false; showControls(); });
  video.addEventListener('pause', () => { if (timer) clearTimeout(timer); controls.style.opacity = '1'; controls.style.pointerEvents = 'auto'; });
  video.addEventListener('play', showControls); window.dispatchEvent(new CustomEvent('twitch-adblock-custom-player-status', { detail: JSON.stringify({ state: 'playing', channel: token.channel }) }));
}
(window as Window & { TwitchAdBlockPlayer?: { start: (token: PlaybackToken) => void; stop: () => void } }).TwitchAdBlockPlayer = { start: mount, stop: () => restore('channel-change') };

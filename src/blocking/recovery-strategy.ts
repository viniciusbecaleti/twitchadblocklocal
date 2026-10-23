export interface RecoveryResult { recovered: boolean; reason?: string; }
/** Recovery is intentionally non-destructive: restore mute state, never reload the page/player. */
export function recoverPlayer(video: HTMLVideoElement | null, originallyMuted: boolean): RecoveryResult {
  if (!video) return { recovered: false, reason: 'video-not-found' };
  video.muted = originallyMuted;
  return { recovered: true };
}

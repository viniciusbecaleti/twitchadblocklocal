export interface PlaybackHealth { healthy: boolean; reason?: string; }
export function assessPlayback(video: HTMLVideoElement | null): PlaybackHealth {
  if (!video) return { healthy: false, reason: 'video-not-found' };
  if (video.error) return { healthy: false, reason: `media-error-${video.error.code}` };
  return { healthy: true };
}

import { assessPlayback } from './playback-health';
export function monitorPlayer(onFailure: (reason: string) => void): () => void {
  const timer = window.setInterval(() => { const result = assessPlayback(document.querySelector('video')); if (!result.healthy) onFailure(result.reason!); }, 10000);
  return () => window.clearInterval(timer);
}

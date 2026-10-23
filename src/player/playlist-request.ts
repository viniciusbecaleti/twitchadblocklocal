export type PlaylistReply = { text: string; error?: never } | { error: string; text?: never };

export class PlaylistRequestError extends Error {
  constructor(public code: string) { super(code); }
}

/** Content-script fetches have the page's CORS restrictions. */
export async function fetchPlaylistText(url: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  // Preserve the original page-origin request when the CDN permits it.
  // Use extension privileges only when the page request fails (e.g. CORS).
  try {
    const response = await fetch(url, { cache: 'no-store', signal });
    if (response.ok) return await response.text();
    if (!chrome.runtime?.id) throw new PlaylistRequestError(`http-${response.status}`);
  } catch (error) {
    if (signal?.aborted || !chrome.runtime?.id) throw error;
  }
  if (chrome.runtime?.id) {
    let reply: PlaylistReply;
    try { reply = await chrome.runtime.sendMessage({ type: 'playback:playlist', url }); }
    catch { throw new PlaylistRequestError('extension-unavailable'); }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!reply || ('error' in reply && reply.error)) throw new PlaylistRequestError(reply?.error ?? 'invalid-reply');
    if (typeof reply.text !== 'string') throw new PlaylistRequestError('invalid-reply');
    return reply.text;
  }
  throw new PlaylistRequestError('extension-unavailable');
}

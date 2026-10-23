export {};
const originalFetch = window.fetch.bind(window);
let lastPlaybackRequest: { url: string; init: RequestInit; body: string } | undefined;
function urlOf(input: RequestInfo | URL): string { return typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString(); }
function bodyOf(input: RequestInfo | URL, init?: RequestInit): Promise<string> { if (typeof init?.body === 'string') return Promise.resolve(init.body); return input instanceof Request ? input.clone().text() : Promise.resolve(''); }
function tokenFrom(payload: unknown): { value: string; signature: string } | null {
  const data = payload as { data?: { streamPlaybackAccessToken?: { value?: string; signature?: string }; videoPlaybackAccessToken?: { value?: string; signature?: string } } };
  const token = data?.data?.streamPlaybackAccessToken ?? data?.data?.videoPlaybackAccessToken;
  return token?.value && token.signature ? { value: token.value, signature: token.signature } : null;
}
function emitProbeError(body: string, probeId: string | undefined, error: string): void {
  if (!probeId) return;
  try {
    const parsed = JSON.parse(body);
    const requests = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of requests) {
      const channel = item.variables?.login ?? item.variables?.channelLogin ?? item.variables?.channel ?? item.variables?.channelName;
      if (typeof channel === 'string' && channel.toLowerCase() === location.pathname.split('/').filter(Boolean)[0]?.toLowerCase()) {
        window.dispatchEvent(new CustomEvent('twitch-adblock-playback-probe-result', { detail: JSON.stringify({ channel, probeId, error }) }));
        return;
      }
    }
  } catch { /* Invalid templates are handled by the probe deadline. */ }
}
function emitPlaybackToken(response: Response, body: string, force = false, probeId?: string): void {
  response.clone().json().then((payload) => {
    const request = JSON.parse(body) as { variables?: Record<string, unknown> } | Array<{ variables?: Record<string, unknown> }>;
    const requests = Array.isArray(request) ? request : [request];
    const responses = Array.isArray(payload) ? payload : [payload];
    let emitted = false;
    requests.forEach((item, index) => {
      const token = tokenFrom(responses[index]);
      const channel = item.variables?.login ?? item.variables?.channelLogin ?? item.variables?.channel ?? item.variables?.channelName;
      const currentChannel = location.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
      if (token && typeof channel === 'string' && channel.toLowerCase() === currentChannel) {
        emitted = true;
        window.dispatchEvent(new CustomEvent(probeId ? 'twitch-adblock-playback-probe-result' : 'twitch-adblock-playback-token', { detail: JSON.stringify({ channel, ...token, force, probeId, playerType: item.variables?.playerType }) }));
      }
    });
    if (!emitted) emitProbeError(body, probeId, 'gql-rejected');
  }).catch(() => emitProbeError(body, probeId, 'gql-invalid-response'));
}
function bodyForChannel(body: string, channel: string, playerType?: string): string | null {
  try {
    type Operation = { operationName?: string; query?: string; variables?: Record<string, unknown> };
    const request = JSON.parse(body) as Operation | Operation[];
    let changed = false;
    const update = (item: Operation) => {
      if (!/PlaybackAccessToken/i.test(`${item.operationName ?? ''} ${item.query ?? ''}`)) return;
      const variables = item.variables;
      if (!variables) return;
      for (const key of ['login', 'channelLogin', 'channel', 'channelName']) if (key in variables) { variables[key] = channel; changed = true; }
      if (playerType) variables.playerType = playerType;
    };
    if (Array.isArray(request)) request.forEach(update); else update(request);
    return changed ? JSON.stringify(request) : null;
  } catch { return null; }
}
function refreshPlaybackToken(body: string, force: boolean, probeId?: string): void {
  if (!lastPlaybackRequest) return;
  // Preserve Twitch's URL and request headers. Adding custom cache headers
  // introduces preflight requirements that the native request did not have.
  const init = { ...lastPlaybackRequest.init, body, cache: 'no-store' as RequestCache };
  originalFetch(lastPlaybackRequest.url, init).then((response) => {
    if (!response.ok) emitProbeError(body, probeId, `gql-http-${response.status}`);
    else emitPlaybackToken(response, body, force, probeId);
  }).catch(() => emitProbeError(body, probeId, 'gql-network-error'));
}
window.fetch = async (input, init) => {
  // Clone Request bodies before fetch consumes them.
  const isGql = /gql|graphql/i.test(urlOf(input));
  const capturedBody = isGql ? bodyOf(input, init).catch(() => '') : Promise.resolve('');
  const response = await originalFetch(input, init);
  if (!isGql) return response;
  const body = await capturedBody;
  if (!/PlaybackAccessToken/i.test(body)) return response;
  const requestHeaders: Record<string, string> = {}; if (input instanceof Request) input.headers.forEach((value, key) => { requestHeaders[key] = value; });
  lastPlaybackRequest = { url: urlOf(input), body, init: { method: init?.method ?? (input instanceof Request ? input.method : 'POST'), headers: init?.headers ?? (input instanceof Request ? requestHeaders : undefined), body, cache: 'no-store', credentials: init?.credentials ?? (input instanceof Request ? input.credentials : undefined) } };
  emitPlaybackToken(response, body);
  return response;
};
window.addEventListener('twitch-adblock-refresh-playback-token', () => { if (!lastPlaybackRequest) return; const channel = location.pathname.split('/').filter(Boolean)[0]; const body = channel && bodyForChannel(lastPlaybackRequest.body, channel); if (body) refreshPlaybackToken(body, true); });
window.addEventListener('twitch-adblock-probe-playback-token', (event) => { try { const { channel, probeId, playerType } = JSON.parse((event as CustomEvent<string>).detail); if (typeof channel !== 'string' || typeof probeId !== 'string' || !lastPlaybackRequest) return; if (playerType !== undefined && !['site', 'embed', 'popout', 'autoplay'].includes(playerType)) return; const body = bodyForChannel(lastPlaybackRequest.body, channel, playerType); if (body) refreshPlaybackToken(body, false, probeId); } catch { /* malformed request */ } });
window.addEventListener('twitch-adblock-channel-change', (event) => { const channel = (event as CustomEvent<unknown>).detail; if (typeof channel !== 'string' || !lastPlaybackRequest) return; const body = bodyForChannel(lastPlaybackRequest.body, channel); if (body) refreshPlaybackToken(body, true); });

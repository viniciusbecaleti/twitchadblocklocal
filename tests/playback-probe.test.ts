import { expect, it, vi } from 'vitest';

it('extracts batched token responses and probes the current channel without restarting playback', async () => {
  history.replaceState(null, '', '/first');
  const nativeTokens: unknown[] = [];
  const probes: unknown[] = [];
  const tokenListener = (event: Event) => nativeTokens.push(JSON.parse((event as CustomEvent<string>).detail));
  const probeListener = (event: Event) => probes.push(JSON.parse((event as CustomEvent<string>).detail));
  window.addEventListener('twitch-adblock-playback-token', tokenListener);
  window.addEventListener('twitch-adblock-playback-probe-result', probeListener);
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify([
    { data: { viewer: {} } },
    { data: { streamPlaybackAccessToken: { value: 'token', signature: 'sig' } } }
  ])));
  vi.stubGlobal('fetch', fetchMock);
  try {
    await import('../src/content/page-hook');
    await window.fetch('https://gql.twitch.tv/gql', { method: 'POST', credentials: 'include', headers: { 'Client-ID': 'test-client' }, body: JSON.stringify([
      { operationName: 'Viewer' },
      { operationName: 'PlaybackAccessToken', variables: { login: 'first', playerType: 'site' } }
    ]) });
    await vi.waitFor(() => expect(nativeTokens).toHaveLength(1));
    expect(nativeTokens[0]).toMatchObject({ channel: 'first', value: 'token' });
    history.replaceState(null, '', '/second');
    window.dispatchEvent(new CustomEvent('twitch-adblock-probe-playback-token', { detail: JSON.stringify({ channel: 'second', probeId: 'probe-1' }) }));
    await vi.waitFor(() => expect(probes).toHaveLength(1));
    expect(probes[0]).toMatchObject({ channel: 'second', value: 'token', probeId: 'probe-1' });
    expect(nativeTokens).toHaveLength(1);
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(init.cache).toBe('no-store');
    expect(JSON.parse(init.body as string)[1].variables.login).toBe('second');
    for (const playerType of ['embed', 'popout', 'autoplay']) {
      window.dispatchEvent(new CustomEvent('twitch-adblock-probe-playback-token', { detail: JSON.stringify({ channel: 'second', probeId: playerType, playerType }) }));
    }
    await vi.waitFor(() => expect(probes).toHaveLength(4));
    expect(probes.slice(1)).toEqual(expect.arrayContaining(['embed', 'popout', 'autoplay'].map((playerType) => expect.objectContaining({ probeId: playerType, playerType }))));
    const alternateBodies = fetchMock.mock.calls.slice(2).map((call) => JSON.parse(call[1]!.body as string));
    expect(alternateBodies.map((body) => body[1].variables.playerType)).toEqual(['embed', 'popout', 'autoplay']);
    expect(alternateBodies.every((body) => body[0].operationName === 'Viewer')).toBe(true);
    expect(nativeTokens).toHaveLength(1);
    expect(fetchMock.mock.calls.every((call) => call[0] === 'https://gql.twitch.tv/gql')).toBe(true);
    expect(new Headers(init.headers).has('pragma')).toBe(false);
    expect(new Headers(init.headers).has('cache-control')).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: 'rejected' }] })));
    window.dispatchEvent(new CustomEvent('twitch-adblock-probe-playback-token', { detail: JSON.stringify({ channel: 'second', probeId: 'rejected', playerType: 'embed' }) }));
    await vi.waitFor(() => expect(probes).toHaveLength(5));
    expect(probes[4]).toMatchObject({ probeId: 'rejected', error: 'gql-rejected' });
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    window.dispatchEvent(new CustomEvent('twitch-adblock-probe-playback-token', { detail: JSON.stringify({ channel: 'second', probeId: 'http-error', playerType: 'popout' }) }));
    await vi.waitFor(() => expect(probes).toHaveLength(6));
    expect(probes[5]).toMatchObject({ probeId: 'http-error', error: 'gql-http-503' });
  } finally {
    window.removeEventListener('twitch-adblock-playback-token', tokenListener);
    window.removeEventListener('twitch-adblock-playback-probe-result', probeListener);
    vi.unstubAllGlobals();
  }
});

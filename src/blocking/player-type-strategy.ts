/**
 * Twitch selects an HLS entitlement with the PlaybackAccessToken GQL request.
 * An embed entitlement sometimes carries a clean stream where a site entitlement
 * carries SSAI. This is intentionally narrow: unrelated GQL requests are left intact.
 */
export function rewritePlaybackAccessTokenBody(body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (typeof body !== 'string' || !/PlaybackAccessToken|videoPlaybackAccessToken/i.test(body)) return body;
  try {
    const parsed = JSON.parse(body) as unknown;
    const rewrite = (item: unknown): unknown => {
      if (!item || typeof item !== 'object') return item;
      const operation = item as { operationName?: string; variables?: Record<string, unknown> };
      if (/PlaybackAccessToken/i.test(operation.operationName ?? '') && operation.variables) {
        return { ...operation, variables: { ...operation.variables, playerType: 'embed', parent: undefined, parentDomains: undefined } };
      }
      return item;
    };
    return JSON.stringify(Array.isArray(parsed) ? parsed.map(rewrite) : rewrite(parsed));
  } catch { return body; }
}

export function isPlaybackTokenRequest(url: string): boolean { return /gql|graphql/i.test(url); }

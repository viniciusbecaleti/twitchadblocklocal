import { describe, expect, it } from 'vitest';
import { rewritePlaybackAccessTokenBody } from '../src/blocking/player-type-strategy';
describe('alternate player-token strategy', () => {
  it('changes only a playback token request to embed', () => {
    const source = JSON.stringify({ operationName: 'PlaybackAccessToken_Template', variables: { login: 'channel', playerType: 'site' } });
    expect(JSON.parse(rewritePlaybackAccessTokenBody(source) as string)).toMatchObject({ variables: { playerType: 'embed', login: 'channel' } });
  });
  it('leaves other request bodies untouched', () => expect(rewritePlaybackAccessTokenBody('{"operationName":"ViewerCard"}')).toBe('{"operationName":"ViewerCard"}'));
});

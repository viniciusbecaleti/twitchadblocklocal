import { syncBlocking } from '../blocking/blocking-manager';
import { getSettings, patchSettings } from '../storage/settings';
import { log } from '../utils/logger';
import { readPlaylist } from './playlist-reader';

void syncBlocking();
chrome.runtime.onInstalled.addListener(() => void syncBlocking());
chrome.storage.onChanged.addListener((changes) => { if (changes.enabled) void syncBlocking(); });
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'HLS_AD_DETECTED') void log('info', 'ad-detected-hls', JSON.stringify(message.detail));
  if (message.type === 'PLAYER_TYPE_ALTERNATE') void log('info', 'alternate-player-type-requested', String(message.detail));
  if (message.type === 'CUSTOM_PLAYER_STARTED') void log('info', 'custom-player-started', String(message.detail));
  if (message.type === 'CUSTOM_PLAYER_STATUS') void log('info', 'custom-player-status', String(message.detail));
  if (message.type === 'PLAYER_UNHEALTHY') void log('warn', 'player-unhealthy', String(message.detail));
  if (message.type === 'VISUAL_ADS_REMOVED') void getSettings().then((settings) => patchSettings({ confirmedBlocked: settings.confirmedBlocked + Number(message.detail || 0) }));
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type === 'playback:playlist') {
    if (sender.id !== chrome.runtime.id) { reply({ error: 'forbidden-sender' }); return; }
    void readPlaylist(message.url).then(reply);
    return true;
  }
  if (message.type === 'settings:get') { void getSettings().then(reply); return true; }
  if (message.type === 'settings:patch') { void patchSettings(message.patch).then(reply); return true; }
});

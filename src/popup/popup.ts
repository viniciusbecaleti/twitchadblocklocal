import { channelFromPath, type Settings } from '../storage/settings';
import { diagnostics } from '../utils/logger';
const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const enabled = $<HTMLInputElement>('#enabled'); const byChannel = $<HTMLInputElement>('#channel-toggle'); const channel = channelFromPath();
async function settings(): Promise<Settings> { return chrome.runtime.sendMessage({ type: 'settings:get' }); }
async function save(patch: Partial<Settings>): Promise<void> { await chrome.runtime.sendMessage({ type: 'settings:patch', patch }); await render(); }
async function render(): Promise<void> {
  const value = await settings(); const disabled = channel ? value.disabledChannels.includes(channel) : false;
  enabled.checked = value.enabled; byChannel.checked = !disabled; byChannel.disabled = !channel;
  $('#channel').textContent = channel ? `/${channel}` : 'abra uma live'; $('#blocked').textContent = String(value.confirmedBlocked);
  $('#status').textContent = value.enabled ? (disabled ? 'Pausada neste canal' : 'Proteção local ativa') : 'Proteção desativada';
  $('#status').textContent += ` · v${chrome.runtime.getManifest().version}`;
  const events = await diagnostics(); $('#diagnostics').textContent = events.length ? events.slice(-8).map((e) => `${e.at.slice(11,19)} ${e.event}${e.detail ? ` · ${e.detail}` : ''}`).join('\n') : 'Nenhum evento.';
}
enabled.addEventListener('change', () => void save({ enabled: enabled.checked }));
byChannel.addEventListener('change', async () => { if (!channel) return; const value = await settings(); const set = new Set(value.disabledChannels); byChannel.checked ? set.delete(channel) : set.add(channel); await save({ disabledChannels: [...set] }); });
void render();

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, Bug, ShieldCheck } from 'lucide-react';
import { channelFromPath, type Settings } from '../storage/settings';
import { Switch } from '../components/ui/switch';
import { diagnostics } from '../utils/logger';
import './popup.css';

const channel = channelFromPath();

async function loadSettings(): Promise<Settings> {
  return chrome.runtime.sendMessage({ type: 'settings:get' });
}

function Popup(): React.ReactElement {
  const [settings, setSettings] = useState<Settings>();
  const [events, setEvents] = useState('Nenhum evento.');
  const refresh = async () => {
    const [nextSettings, nextEvents] = await Promise.all([loadSettings(), diagnostics()]);
    setSettings(nextSettings);
    setEvents(nextEvents.length ? nextEvents.slice(-8).map((event) => `${event.at.slice(11, 19)} ${event.event}${event.detail ? ` · ${event.detail}` : ''}`).join('\n') : 'Nenhum evento.');
  };
  useEffect(() => { void refresh(); }, []);
  const save = async (patch: Partial<Settings>) => { await chrome.runtime.sendMessage({ type: 'settings:patch', patch }); await refresh(); };
  const disabled = Boolean(channel && settings?.disabledChannels.includes(channel));
  const status = !settings ? 'Carregando…' : !settings.enabled ? 'Proteção desativada' : disabled ? 'Pausada neste canal' : 'Proteção local ativa';
  return <main>
    <header><div className="mark"><ShieldCheck size={22} strokeWidth={2.5} /></div><div><h1>Twitch AdBlock</h1><p>{status} · v{chrome.runtime.getManifest().version}</p></div></header>
    <section className="card">
      <div className="row"><span>Proteção</span><Switch checked={settings?.enabled ?? false} aria-label="Proteção" onCheckedChange={(enabled) => void save({ enabled })} /></div>
      <div className="row"><span>Canal atual <small>{channel ? `/${channel}` : 'abra uma live'}</small></span><Switch checked={Boolean(channel && !disabled)} disabled={!channel} aria-label="Proteção neste canal" onCheckedChange={async (enabled) => { if (!channel || !settings) return; const channels = new Set(settings.disabledChannels); enabled ? channels.delete(channel) : channels.add(channel); await save({ disabledChannels: [...channels] }); }} /></div>
    </section>
    <section className="metric"><span><Activity size={15} /> Anúncios confirmadamente bloqueados</span><strong>{settings?.confirmedBlocked ?? 0}</strong><small>Somente remoções de sobreposições independentes são contabilizadas.</small></section>
    <details><summary><Bug size={14} /> Diagnóstico</summary><pre>{events}</pre></details>
  </main>;
}

createRoot(document.querySelector<HTMLElement>('#root')!).render(<Popup />);

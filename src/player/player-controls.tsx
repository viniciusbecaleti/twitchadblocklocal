import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChevronRight, Fullscreen, Gauge, Pause, Play, Settings, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Slider } from '../components/ui/slider';
import { Switch } from '../components/ui/switch';

type QualityOption = { value: number; label: string };

export type PlayerControlsOptions = {
  video: HTMLVideoElement;
  host: HTMLElement;
  version: string;
  getQualityOptions: () => QualityOption[];
  getQuality: () => number;
  getLowLatency: () => boolean;
  onQualityChange: (quality: number) => void;
  onLowLatencyChange: () => void;
  onPersistVolume: () => void;
};

export type PlayerControls = { refresh: () => void; destroy: () => void };

const iconButton: CSSProperties = { display: 'grid', placeItems: 'center', width: 36, height: 36, border: 0, borderRadius: 4, padding: 6, background: 'transparent', color: '#fff', cursor: 'pointer' };

function IconButton({ title, children, onClick }: { title: string; children: ReactNode; onClick: () => void }): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  return <button type="button" title={title} aria-label={title} onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{ ...iconButton, background: hovered ? 'rgba(255,255,255,.15)' : 'transparent' }}>{children}</button>;
}

function PlayerControlsView({ options, revision }: { options: PlayerControlsOptions; revision: number }): React.ReactElement {
  const { video, host } = options;
  const [playing, setPlaying] = useState(!video.paused);
  const [muted, setMuted] = useState(video.muted || video.volume === 0);
  const [volume, setVolume] = useState(Math.round((video.muted ? 0 : video.volume) * 100));
  const [visible, setVisible] = useState(true);
  const [interacting, setInteracting] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [, setClock] = useState(0);
  const qualities = options.getQualityOptions();
  const lowLatency = options.getLowLatency();

  useEffect(() => {
    const update = () => { setPlaying(!video.paused); setMuted(video.muted || video.volume === 0); setVolume(Math.round((video.muted ? 0 : video.volume) * 100)); };
    ['play', 'pause', 'volumechange'].forEach((event) => video.addEventListener(event, update));
    return () => ['play', 'pause', 'volumechange'].forEach((event) => video.removeEventListener(event, update));
  }, [video]);

  useEffect(() => {
    let timer: number | undefined;
    const hide = () => { if (!interacting && !video.paused) setVisible(false); };
    const show = () => { if (timer) clearTimeout(timer); setVisible(true); if (!interacting && !video.paused) timer = window.setTimeout(hide, 2000); };
    const leave = () => { setInteracting(false); if (timer) clearTimeout(timer); timer = window.setTimeout(hide, 2000); };
    host.addEventListener('mousemove', show);
    host.addEventListener('mouseenter', show);
    host.addEventListener('mouseleave', leave);
    video.addEventListener('play', show);
    video.addEventListener('pause', show);
    show();
    return () => { if (timer) clearTimeout(timer); host.removeEventListener('mousemove', show); host.removeEventListener('mouseenter', show); host.removeEventListener('mouseleave', leave); video.removeEventListener('play', show); video.removeEventListener('pause', show); };
  }, [host, video, interacting]);

  const reveal = () => { setVisible(true); setClock((value) => value + 1); };
  const setPlayerVolume = (next: number) => { video.volume = next / 100; video.muted = next === 0; options.onPersistVolume(); };
  const fullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void host.requestFullscreen().catch(() => undefined); };

  return (
    <div
      onMouseEnter={() => { setInteracting(true); reveal(); }}
      onMouseLeave={() => { setInteracting(false); }}
      style={{ position: 'absolute', zIndex: 2, inset: 'auto 0 0', padding: '46px 12px 9px', background: 'linear-gradient(transparent,rgba(0,0,0,.9))', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: visible ? 'opacity 0ms' : 'opacity 1000ms ease' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36 }}>
        <IconButton title={playing ? 'Pausar' : 'Reproduzir'} onClick={() => { void (video.paused ? video.play() : video.pause()); }}>
          {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        </IconButton>
        <div onMouseEnter={() => { setVolumeOpen(true); reveal(); }} onMouseLeave={() => setVolumeOpen(false)} style={{ display: 'flex', alignItems: 'center', borderRadius: 18, background: volumeOpen ? 'rgba(0,0,0,.68)' : 'transparent', transition: 'background 180ms ease' }}>
          <IconButton title={muted ? 'Ativar som' : 'Silenciar'} onClick={() => { video.muted = !video.muted; options.onPersistVolume(); }}>
            {muted ? <VolumeX size={24} /> : <Volume2 size={24} />}
          </IconButton>
          <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', width: volumeOpen ? 88 : 0, opacity: volumeOpen ? 1 : 0, transition: 'width 180ms ease,opacity 140ms ease' }}>
            <Slider min={0} max={100} step={1} value={[volume]} onValueChange={([next]) => setPlayerVolume(next)} style={{ margin: '0 7px 0 2px' }} />
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <Popover>
          <PopoverTrigger asChild>
            <IconButton title={`Configurações · v${options.version}`} onClick={reveal}><Settings size={22} /></IconButton>
          </PopoverTrigger>
          <PopoverContent container={host} align="end" style={{ width: 296, padding: 8, borderRadius: 12, background: 'rgba(15,15,15,.96)', boxShadow: '0 8px 28px rgba(0,0,0,.48)', backdropFilter: 'blur(12px)', color: '#fff', font: '14px Roboto,Arial,sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minHeight: 44, padding: '0 9px', borderRadius: 7 }}>
              <SlidersHorizontal size={20} /><span style={{ flex: 1 }}>Qualidade</span>
              <select aria-label="Qualidade" value={options.getQuality()} onChange={(event) => options.onQualityChange(Number(event.target.value))} style={{ maxWidth: 142, border: 0, background: 'transparent', color: '#d4ceda', font: '13px Roboto,Arial,sans-serif', textAlign: 'right', cursor: 'pointer', outline: 'none' }}>
                {qualities.map((quality) => <option key={quality.value} value={quality.value} style={{ background: '#17131b', color: '#fff' }}>{quality.label}</option>)}
              </select>
              <ChevronRight size={16} color="#b8b1c0" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minHeight: 44, padding: '0 9px', borderRadius: 7 }}>
              <Gauge size={20} /><span style={{ flex: 1 }}>Baixa latência</span>
              <Switch checked={lowLatency} aria-label="Baixa latência" onCheckedChange={options.onLowLatencyChange} />
            </div>
          </PopoverContent>
        </Popover>
        <IconButton title="Tela cheia" onClick={fullscreen}><Fullscreen size={22} /></IconButton>
      </div>
    </div>
  );
}

export function mountPlayerControls(element: HTMLElement, options: PlayerControlsOptions): PlayerControls {
  let revision = 0;
  const root: Root = createRoot(element);
  const render = () => root.render(<PlayerControlsView options={options} revision={revision} />);
  render();
  return { refresh: () => { revision += 1; render(); }, destroy: () => root.unmount() };
}

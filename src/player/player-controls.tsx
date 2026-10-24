import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChevronRight, Fullscreen, Gauge, Pause, Play, Settings, ShieldAlert, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
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
  getResolutionLabel: () => string | null;
  isAdLimited: () => boolean;
  onQualityChange: (quality: number) => void;
  onLowLatencyChange: () => void;
  onPersistVolume: () => void;
};

export type PlayerControls = { refresh: () => void; destroy: () => void };

const iconButton: CSSProperties = { display: 'grid', placeItems: 'center', width: 50, height: 50, border: '1px solid rgba(255,255,255,.08)', borderRadius: 999, padding: 6, background: 'rgba(14,12,15,.58)', color: '#fff', cursor: 'pointer', boxShadow: '0 3px 12px rgba(0,0,0,.22)', transition: 'background 150ms ease,box-shadow 150ms ease,transform 150ms ease' };

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & { title: string; children: ReactNode; bare?: boolean };

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ title, children, onMouseEnter, onMouseLeave, style, bare = false, ...props }, ref): ReactElement {
  const [hovered, setHovered] = useState(false);
  return <button ref={ref} type="button" title={title} aria-label={title} {...props} onMouseEnter={(event) => { setHovered(true); onMouseEnter?.(event); }} onMouseLeave={(event) => { setHovered(false); onMouseLeave?.(event); }} style={{ ...iconButton, ...(bare ? { width: 50, height: 50, border: 0, background: 'transparent', boxShadow: 'none' } : {}), background: hovered ? (bare ? 'rgba(255,255,255,.08)' : 'rgba(63,58,60,.78)') : (bare ? 'transparent' : 'rgba(14,12,15,.58)'), boxShadow: hovered && !bare ? '0 0 0 5px rgba(0,0,0,.18),0 4px 14px rgba(0,0,0,.3)' : undefined, ...style }}>{children}</button>;
});

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
  const resolution = options.getResolutionLabel();
  const adLimited = options.isAdLimited();

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
          {playing ? <Pause size={27} fill="currentColor" /> : <Play size={27} fill="currentColor" />}
        </IconButton>
        <div onMouseEnter={() => { setVolumeOpen(true); reveal(); }} onMouseLeave={() => setVolumeOpen(false)} style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,.08)', borderRadius: 999, background: volumeOpen ? 'rgba(77,72,74,.66)' : 'rgba(14,12,15,.58)', boxShadow: volumeOpen ? '0 0 0 5px rgba(0,0,0,.18),0 4px 14px rgba(0,0,0,.3)' : '0 3px 12px rgba(0,0,0,.22)', transition: 'background 180ms ease,box-shadow 180ms ease' }}>
          <IconButton bare title={muted ? 'Ativar som' : 'Silenciar'} onClick={() => { video.muted = !video.muted; options.onPersistVolume(); }}>
            {muted ? <VolumeX size={27} /> : <Volume2 size={27} />}
          </IconButton>
          <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', width: volumeOpen ? 88 : 0, opacity: volumeOpen ? 1 : 0, transition: 'width 180ms ease,opacity 140ms ease' }}>
            <Slider min={0} max={100} step={1} value={[volume]} onValueChange={([next]) => setPlayerVolume(next)} style={{ margin: '0 7px 0 2px' }} />
          </div>
        </div>
        <span style={{ flex: 1 }} />
        {resolution && <span aria-label={`Resolução atual: ${resolution}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 32, padding: '0 11px', border: '1px solid rgba(255,255,255,.13)', borderRadius: 999, background: 'rgba(14,12,15,.58)', color: '#fff', font: '600 13px Roboto,Arial,sans-serif', letterSpacing: '.1px' }}>{resolution}</span>}
        {adLimited && <span aria-label="Qualidade reduzida durante anúncio" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 32, padding: '0 11px', border: '1px solid rgba(255,174,61,.32)', borderRadius: 999, background: 'rgba(89,50,14,.72)', color: '#ffd086', font: '600 13px Roboto,Arial,sans-serif' }}><ShieldAlert size={15} />Anúncio</span>}
        <Popover>
          <PopoverTrigger asChild>
            <IconButton title={`Configurações · v${options.version}`} onClick={reveal}><Settings size={22} /></IconButton>
          </PopoverTrigger>
          <PopoverContent container={host} side="top" align="end" collisionPadding={20} style={{ width: 390, padding: 16, border: '1px solid rgba(255,255,255,.08)', borderRadius: 24, background: 'rgba(31,26,23,.80)', boxShadow: '0 18px 42px rgba(0,0,0,.48)', backdropFilter: 'blur(18px)', color: '#fff', font: '16px Roboto,Arial,sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 64, padding: '0 14px', borderRadius: 14 }}>
              <SlidersHorizontal size={27} strokeWidth={2.25} /><span style={{ flex: 1 }}>Qualidade</span>
              <select aria-label="Qualidade" value={options.getQuality()} onChange={(event) => options.onQualityChange(Number(event.target.value))} style={{ maxWidth: 180, border: 0, background: 'transparent', color: '#d4ceda', font: '16px Roboto,Arial,sans-serif', textAlign: 'right', cursor: 'pointer', outline: 'none' }}>
                {qualities.map((quality) => <option key={quality.value} value={quality.value} style={{ background: '#17131b', color: '#fff' }}>{quality.label}</option>)}
              </select>
              <ChevronRight size={20} color="#d4ceda" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 64, padding: '0 14px', borderRadius: 14 }}>
              <Gauge size={27} strokeWidth={2.25} /><span style={{ flex: 1 }}>Baixa latência</span>
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

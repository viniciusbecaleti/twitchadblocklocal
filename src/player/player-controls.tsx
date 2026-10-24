import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Check, ChevronLeft, ChevronRight, Fullscreen, Gauge, Pause, Play, Settings, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Slider } from '../components/ui/slider';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';

type QualityOption = { value: number; label: string };

export type PlayerControlsOptions = {
  video: HTMLVideoElement;
  host: HTMLElement;
  version: string;
  getQualityOptions: () => QualityOption[];
  getQuality: () => number;
  getLowLatency: () => boolean;
  getResolutionLabel: () => string | null;
  onQualityChange: (quality: number) => void;
  onLowLatencyChange: () => void;
  onPersistVolume: () => void;
};

export type PlayerControls = { refresh: () => void; destroy: () => void };

const iconButton: CSSProperties = { display: 'grid', placeItems: 'center', width: 40, height: 40, border: '1px solid rgba(255,255,255,.08)', borderRadius: 999, padding: 6, background: 'rgba(14,12,15,.58)', color: '#fff', cursor: 'pointer', boxShadow: '0 3px 12px rgba(0,0,0,.22)', transition: 'background 150ms ease,box-shadow 150ms ease,transform 150ms ease' };

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & { title: string; children: ReactNode; bare?: boolean };
type MenuButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; active?: boolean };

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ title, children, onMouseEnter, onMouseLeave, style, bare = false, ...props }, ref): ReactElement {
  const [hovered, setHovered] = useState(false);
  return <button ref={ref} type="button" title={title} aria-label={title} {...props} onMouseEnter={(event) => { setHovered(true); onMouseEnter?.(event); }} onMouseLeave={(event) => { setHovered(false); onMouseLeave?.(event); }} style={{ ...iconButton, ...(bare ? { width: 40, height: 40, border: 0, background: 'transparent', boxShadow: 'none' } : {}), background: bare ? 'transparent' : hovered ? 'rgba(63,58,60,.78)' : 'rgba(14,12,15,.58)', boxShadow: hovered && !bare ? '0 0 0 5px rgba(0,0,0,.18),0 4px 14px rgba(0,0,0,.3)' : undefined, ...style }}>{children}</button>;
});

function MenuButton({ children, active = false, onMouseEnter, onMouseLeave, style, ...props }: MenuButtonProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  return <button type="button" {...props} onMouseEnter={(event) => { setHovered(true); onMouseEnter?.(event); }} onMouseLeave={(event) => { setHovered(false); onMouseLeave?.(event); }} style={{ border: 0, borderRadius: 14, background: hovered || active ? 'rgba(255,255,255,.12)' : 'transparent', color: '#fff', cursor: 'pointer', transition: 'background 150ms ease', ...style }}>{children}</button>;
}

function PlayerControlsView({ options, revision }: { options: PlayerControlsOptions; revision: number }): React.ReactElement {
  const { video, host } = options;
  const [playing, setPlaying] = useState(!video.paused);
  const [muted, setMuted] = useState(video.muted || video.volume === 0);
  const [volume, setVolume] = useState(Math.round((video.muted ? 0 : video.volume) * 100));
  const [visible, setVisible] = useState(true);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<'main' | 'quality'>('main');
  const popoverOpenRef = useRef(popoverOpen);
  popoverOpenRef.current = popoverOpen;
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [, setClock] = useState(0);
  const qualities = options.getQualityOptions();
  const selectedQuality = qualities.find((quality) => quality.value === options.getQuality());
  const qualityChoices = qualities.filter((quality) => quality.value >= 0).slice().sort((a, b) => Number.parseInt(b.label, 10) - Number.parseInt(a.label, 10));
  const qualityListHeight = Math.min(360, Math.max(56, (qualityChoices.length + 1) * 54 + 2));
  const lowLatency = options.getLowLatency();
  const resolution = options.getResolutionLabel();

  useEffect(() => {
    const update = () => { setPlaying(!video.paused); setMuted(video.muted || video.volume === 0); setVolume(Math.round((video.muted ? 0 : video.volume) * 100)); };
    ['play', 'pause', 'volumechange'].forEach((event) => video.addEventListener(event, update));
    return () => ['play', 'pause', 'volumechange'].forEach((event) => video.removeEventListener(event, update));
  }, [video]);

  useEffect(() => {
    const previousCursor = host.style.cursor;
    host.style.cursor = visible ? '' : 'none';
    return () => { host.style.cursor = previousCursor; };
  }, [host, visible]);

  useEffect(() => {
    const show = () => setVisible(true);
    let idleTimer: number | undefined;
    const clearIdleTimer = () => { if (idleTimer) window.clearTimeout(idleTimer); idleTimer = undefined; };
    const hide = () => { if (!popoverOpenRef.current && !video.paused) setVisible(false); };
    const restartIdleTimer = () => { clearIdleTimer(); if (!popoverOpenRef.current && !video.paused) idleTimer = window.setTimeout(hide, 3000); };
    const reveal = () => { show(); restartIdleTimer(); };
    const leave = () => { clearIdleTimer(); if (!popoverOpenRef.current && !video.paused) setVisible(false); };
    host.addEventListener('mousemove', reveal);
    host.addEventListener('mouseenter', reveal);
    host.addEventListener('mouseleave', leave);
    video.addEventListener('play', reveal);
    video.addEventListener('pause', show);
    reveal();
    return () => { clearIdleTimer(); host.removeEventListener('mousemove', reveal); host.removeEventListener('mouseenter', reveal); host.removeEventListener('mouseleave', leave); video.removeEventListener('play', reveal); video.removeEventListener('pause', show); };
  }, [host, video]);

  const reveal = () => { setVisible(true); setClock((value) => value + 1); };
  const setPlayerVolume = (next: number) => { video.volume = next / 100; video.muted = next === 0; options.onPersistVolume(); };
  const fullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void host.requestFullscreen().catch(() => undefined); };

  return (
    <div
      onMouseEnter={reveal}
      onMouseLeave={() => { if (!popoverOpen && !video.paused) setVisible(false); }}
      style={{ position: 'absolute', zIndex: 2, inset: 'auto 0 0', padding: '46px 12px 9px', background: 'linear-gradient(transparent,rgba(0,0,0,.9))', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 200ms ease' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40 }}>
        <IconButton title={playing ? 'Pausar' : 'Reproduzir'} onClick={() => { void (video.paused ? video.play() : video.pause()); }}>
          {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        </IconButton>
        <div onMouseEnter={() => { setVolumeOpen(true); reveal(); }} onMouseLeave={() => setVolumeOpen(false)} style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,.08)', borderRadius: 999, background: volumeOpen ? 'rgba(77,72,74,.66)' : 'rgba(14,12,15,.58)', boxShadow: volumeOpen ? '0 0 0 5px rgba(0,0,0,.18),0 4px 14px rgba(0,0,0,.3)' : '0 3px 12px rgba(0,0,0,.22)', transition: 'background 180ms ease,box-shadow 180ms ease' }}>
          <IconButton bare title={muted ? 'Ativar som' : 'Silenciar'} onClick={() => { video.muted = !video.muted; options.onPersistVolume(); }}>
            {muted ? <VolumeX size={24} /> : <Volume2 size={24} />}
          </IconButton>
          <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', width: volumeOpen ? 88 : 0, opacity: volumeOpen ? 1 : 0, transition: 'width 180ms ease,opacity 140ms ease' }}>
            <Slider min={0} max={100} step={1} value={[volume]} onValueChange={([next]) => setPlayerVolume(next)} style={{ margin: '0 7px 0 2px' }} />
          </div>
        </div>
        <span style={{ flex: 1 }} />
        {resolution && <Badge aria-label={`Resolução atual: ${resolution}`}>{resolution}</Badge>}
        <Popover open={popoverOpen} onOpenChange={(open) => { setPopoverOpen(open); if (open) reveal(); else { setSettingsPage('main'); window.requestAnimationFrame(() => { if (!video.paused) setVisible(host.matches(':hover')); }); } }}>
          <PopoverTrigger asChild>
            <IconButton title={`Configurações · v${options.version}`} onClick={reveal}><Settings size={24} /></IconButton>
          </PopoverTrigger>
          <PopoverContent container={host} side="top" align="end" collisionPadding={20} style={{ width: 360, maxHeight: 'calc(100vh - 40px)', padding: 8, border: '1px solid rgba(0,0,0,.68)', borderRadius: 20, background: 'rgba(0,0,0,.68)', boxShadow: '0 18px 42px rgba(0,0,0,.48)', color: '#fff', font: '16px Roboto,Arial,sans-serif', overflow: 'hidden' }}>
            {settingsPage === 'main' ? <>
              <MenuButton onClick={() => setSettingsPage('quality')} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 58, gap: 14, padding: '0 12px', font: '16px Roboto,Arial,sans-serif', textAlign: 'left' }}>
                <SlidersHorizontal size={24} strokeWidth={2.25} /><span style={{ flex: 1 }}>Qualidade</span><span style={{ maxWidth: 150, overflow: 'hidden', color: '#d4ceda', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedQuality?.label ?? 'Automática'}</span><ChevronRight size={20} color="#d4ceda" />
              </MenuButton>
              <MenuButton aria-label="Alternar baixa latência" aria-pressed={lowLatency} onClick={options.onLowLatencyChange} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 58, gap: 14, padding: '0 12px', font: '16px Roboto,Arial,sans-serif', textAlign: 'left' }}>
                <Gauge size={24} strokeWidth={2.25} /><span style={{ flex: 1 }}>Baixa latência</span><Switch checked={lowLatency} aria-label="Baixa latência" onClick={(event) => event.stopPropagation()} onCheckedChange={options.onLowLatencyChange} />
              </MenuButton>
            </> : <>
              <button type="button" onClick={() => setSettingsPage('main')} style={{ display: 'flex', alignItems: 'center', width: 'calc(100% + 16px)', minHeight: 76, gap: 16, margin: '-8px -8px 0', padding: '0 24px', border: 0, borderBottom: '1px solid rgba(255,255,255,.24)', borderRadius: '20px 20px 0 0', background: 'transparent', color: '#fff', cursor: 'pointer', font: '600 18px Roboto,Arial,sans-serif', textAlign: 'left' }}><ChevronLeft size={26} strokeWidth={2.6} />Qualidade</button>
              <ScrollArea style={{ height: `min(${qualityListHeight}px, calc(100vh - 132px))`, marginTop: 14 }}>
                <div style={{ padding: '0 0 2px' }}>
                {qualityChoices.map((quality) => <MenuButton key={quality.value} active={quality.value === options.getQuality()} onClick={() => { options.onQualityChange(quality.value); setSettingsPage('main'); }} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 54, gap: 12, padding: '0 16px', font: '16px Roboto,Arial,sans-serif', textAlign: 'left' }}>{quality.value === options.getQuality() ? <Check size={22} /> : <span style={{ width: 22 }} />}{quality.label}</MenuButton>)}
                <MenuButton active={options.getQuality() === -1} onClick={() => { options.onQualityChange(-1); setSettingsPage('main'); }} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 54, gap: 12, padding: '0 16px', font: '16px Roboto,Arial,sans-serif', textAlign: 'left' }}>{options.getQuality() === -1 ? <Check size={22} /> : <span style={{ width: 22 }} />}Automática</MenuButton>
                </div>
              </ScrollArea>
            </>}
          </PopoverContent>
        </Popover>
        <IconButton title="Tela cheia" onClick={fullscreen}><Fullscreen size={24} /></IconButton>
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

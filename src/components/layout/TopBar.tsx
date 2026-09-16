import React, { useState, useEffect } from 'react';
import { MioCoreState, MioSystemMode, NetworkState } from '../../types/core';
import { MioCoreVisualizer } from '../../core/MioCoreVisualizer';
import { emergencyStop } from '../../core/EmergencyStop';
import { eventBus } from '../../core/EventBus';
import {
  Shield,
  Wifi,
  WifiOff,
  AlertOctagon,
  RotateCcw,
  Minus,
  Square,
  X,
  Menu,
  PanelRight,
} from 'lucide-react';
import { ModelRouter } from '../../agents/ModelRouter';
import { releaseMetadata, shortReleaseSha } from '../../release/ReleaseMetadata';
import { systemPreferences } from '../../settings/SystemPreferences';

interface TopBarProps {
  coreState: MioCoreState;
  activeMode: MioSystemMode;
  onOpenSecurity: () => void;
  onToggleNavigation: () => void;
  onToggleContext: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  coreState,
  activeMode,
  onOpenSecurity,
  onToggleNavigation,
  onToggleContext,
}) => {
  const [network, setNetwork] = useState<NetworkState>(ModelRouter.getNetworkState());
  const [preferences, setPreferences] = useState(() => systemPreferences.getSnapshot());
  const [isStopped, setIsStopped] = useState<boolean>(emergencyStop.isEmergencyStopped());
  const isDesktop = typeof window !== 'undefined' && Boolean(window.mioDesktop);

  useEffect(() => {
    const unsubStop = eventBus.on('EMERGENCY_STOP_TRIGGERED', () => setIsStopped(true));
    const unsubReset = eventBus.on('EMERGENCY_STOP_RESET', () => setIsStopped(false));
    const unsubPreferences = systemPreferences.subscribe((nextPreferences) => {
      setNetwork(nextPreferences.networkState);
      setPreferences(nextPreferences);
    });

    let unregisterTrayStop: (() => void) | undefined;
    if (window.mioDesktop?.onEmergencyStopTriggered) {
      unregisterTrayStop = window.mioDesktop.onEmergencyStopTriggered((reason) => {
        emergencyStop.triggerEmergencyStop(reason);
      });
    }

    return () => {
      unsubStop();
      unsubReset();
      unsubPreferences();
      if (unregisterTrayStop) unregisterTrayStop();
    };
  }, []);

  const handleStopToggle = () => {
    if (isStopped) emergencyStop.reset();
    else emergencyStop.triggerEmergencyStop('User pressed STOP MIO button');
  };

  const toggleNetwork = () => {
    const next = network === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    void systemPreferences.setNetworkState(next);
    eventBus.emit('CORE_STATE_CHANGE', next === 'ONLINE' ? 'ONLINE' : 'OFFLINE');
    setTimeout(() => eventBus.emit('CORE_STATE_CHANGE', 'IDLE'), 1500);
  };

  const handleMinimize = () => window.mioDesktop?.minimizeWindow();
  const handleMaximize = () => window.mioDesktop?.maximizeWindow();
  const handleClose = () => window.mioDesktop?.closeWindow();

  const runtimeLabel = releaseMetadata.runtime === 'desktop' ? 'DESKTOP' : 'WEB LAB';
  const releaseLabel = `${releaseMetadata.channel.toUpperCase()} · ${shortReleaseSha}`;

  return (
    <header
      className="h-16 lg:h-14 shrink-0 bg-[#071522]/95 border-b border-sky-950/60 flex items-center justify-between gap-2 px-2 sm:px-3 lg:px-4 pt-[env(safe-area-inset-top)] lg:pt-0 select-none z-30 font-mono text-xs backdrop-blur-xl"
      style={{ WebkitAppRegion: isDesktop ? 'drag' : 'no-drag' } as any}
    >
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          type="button"
          onClick={onToggleNavigation}
          className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-sky-300/15 bg-[#0b1b2d] text-sky-200 hover:border-sky-300/35 hover:bg-sky-950/35 active:bg-sky-950/60 touch-manipulation"
          aria-label="Open workspace menu"
          title="Workspaces"
        >
          <Menu size={20} />
        </button>

        <div className="hidden sm:block opacity-90">
          <MioCoreVisualizer state={coreState} size={34} interactive={false} priority="compact" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-extrabold text-white tracking-wider text-sm flex items-center shrink-0">
              MIO <span className="text-sky-300 ml-1">V2</span>
            </span>
            <span className="hidden xl:inline-flex text-[9px] px-1.5 py-0.5 rounded bg-sky-950/55 text-sky-200 border border-sky-300/20" title={`Version ${releaseMetadata.version} · Deployment ${releaseMetadata.deploymentId}`}>
              {runtimeLabel} · {releaseLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-slate-500 min-w-0">
            <span className="hidden sm:inline">CORE: <strong className="text-sky-300">{coreState}</strong></span>
            <span className="hidden sm:inline">//</span>
            <span className="truncate">VIEW: <strong className="text-slate-200">{activeMode}</strong></span>
          </div>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          type="button"
          onClick={toggleNetwork}
          className={`min-h-9 flex items-center gap-1.5 px-3 py-1 rounded-full border transition cursor-pointer touch-manipulation ${
            network === 'ONLINE'
              ? 'bg-sky-950/35 border-sky-300/25 text-sky-200'
              : 'bg-slate-900/60 border-slate-700 text-slate-400'
          }`}
          title="Toggle Online/Offline Connectivity"
        >
          {network === 'ONLINE' ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span className="text-[10px] font-bold">{network}</span>
        </button>

        <button type="button" onClick={() => eventBus.emit('SWITCH_MODE', 'SETTINGS')} className="hidden lg:flex min-h-9 items-center gap-1.5 rounded-full border border-sky-300/15 bg-sky-950/20 px-3 py-1 text-[10px] font-bold text-sky-100 hover:bg-sky-950/40" title="Open provider and autonomy settings">
          <span>{preferences.modelRouter.provider.toUpperCase()}</span>
          <span className="text-sky-700">·</span>
          <span>{preferences.autonomyLevel}</span>
        </button>

        <button
          type="button"
          onClick={onOpenSecurity}
          className="hidden lg:flex min-h-9 items-center gap-1.5 px-3 py-1 rounded-full bg-sky-950/25 border border-sky-300/20 text-sky-200 hover:bg-sky-950/45 transition cursor-pointer touch-manipulation"
        >
          <Shield size={12} />
          <span className="text-[10px] font-bold hidden xl:inline">SECURITY: L0-L5 ENFORCED</span>
          <span className="text-[10px] font-bold xl:hidden">SECURITY</span>
        </button>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          type="button"
          onClick={onToggleContext}
          className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-sky-300/15 bg-[#0b1b2d] text-sky-200 hover:border-sky-300/35 hover:bg-sky-950/35 active:bg-sky-950/60 touch-manipulation"
          aria-label="Open context and telemetry"
          title="Context & Telemetry"
        >
          <PanelRight size={19} />
        </button>

        {isStopped ? (
          <button
            type="button"
            onClick={handleStopToggle}
            className="h-11 min-w-11 flex items-center justify-center gap-2 px-3 sm:px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold shadow-lg shadow-emerald-500/30 transition cursor-pointer touch-manipulation"
            aria-label="Reset emergency stop"
          >
            <RotateCcw size={16} />
            <span className="hidden sm:inline">RESET STOP</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStopToggle}
            className="h-11 min-w-11 flex items-center justify-center gap-2 px-3 sm:px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold shadow-lg shadow-red-600/35 transition cursor-pointer touch-manipulation"
            title="Immediately halt all generations, audio, agent tasks, and network calls"
            aria-label="Emergency stop MIO"
          >
            <AlertOctagon size={16} />
            <span className="hidden sm:inline">STOP MIO</span>
          </button>
        )}

        {isDesktop && (
          <div className="hidden lg:flex items-center gap-1 border-l border-sky-950/70 pl-3">
            <button type="button" onClick={handleMinimize} className="p-1.5 text-slate-400 hover:text-sky-200 hover:bg-sky-950/30 rounded transition cursor-pointer" title="Minimize to taskbar"><Minus size={13} /></button>
            <button type="button" onClick={handleMaximize} className="p-1.5 text-slate-400 hover:text-sky-200 hover:bg-sky-950/30 rounded transition cursor-pointer" title="Maximize / Restore window"><Square size={12} /></button>
            <button type="button" onClick={handleClose} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/60 rounded transition cursor-pointer" title="Close Application"><X size={14} /></button>
          </div>
        )}
      </div>
    </header>
  );
};

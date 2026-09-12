import React, { useState, useEffect } from 'react';
import { MioCoreState, MioSystemMode, NetworkState } from '../../types/core';
import { MioCoreVisualizer } from '../../core/MioCoreVisualizer';
import { emergencyStop } from '../../core/EmergencyStop';
import { eventBus } from '../../core/EventBus';
import { Shield, Wifi, WifiOff, AlertOctagon, RotateCcw, Minus, Square, X, Cloud } from 'lucide-react';
import { ModelRouter } from '../../agents/ModelRouter';

interface TopBarProps { coreState: MioCoreState; activeMode: MioSystemMode; onOpenSecurity: () => void; }

export const TopBar: React.FC<TopBarProps> = ({ coreState, activeMode, onOpenSecurity }) => {
  const [network, setNetwork] = useState<NetworkState>(ModelRouter.getNetworkState());
  const [isStopped, setIsStopped] = useState<boolean>(emergencyStop.isEmergencyStopped());
  const [isWeb, setIsWeb] = useState(false);

  useEffect(() => {
    void window.mioDesktop?.getSecurityStatus().then((status) => setIsWeb(status?.runtime === 'web')).catch(() => undefined);
    const unsubStop = eventBus.on('EMERGENCY_STOP_TRIGGERED', () => setIsStopped(true));
    const unsubReset = eventBus.on('EMERGENCY_STOP_RESET', () => setIsStopped(false));
    const unregisterTrayStop = window.mioDesktop?.onEmergencyStopTriggered?.((reason) => emergencyStop.triggerEmergencyStop(reason));
    return () => { unsubStop(); unsubReset(); unregisterTrayStop?.(); };
  }, []);

  const handleStopToggle = () => isStopped ? emergencyStop.reset() : emergencyStop.triggerEmergencyStop('User pressed STOP MIO button');

  const toggleNetwork = async () => {
    const next: NetworkState = network === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    setNetwork(next);
    ModelRouter.setNetworkState(next);
    await window.mioDesktop?.setSetting('system.network', next);
    eventBus.emit('CORE_STATE_CHANGE', next === 'ONLINE' ? 'ONLINE' : 'OFFLINE');
    setTimeout(() => eventBus.emit('CORE_STATE_CHANGE', 'IDLE'), 1200);
  };

  return (
    <header className="h-14 bg-[#090d16] border-b border-gray-800 flex items-center justify-between px-4 select-none z-30 font-mono text-xs" style={{ WebkitAppRegion: isWeb ? undefined : 'drag' } as any}>
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <MioCoreVisualizer state={coreState} size={36} interactive={false} />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white tracking-wider text-sm flex items-center">MIO <span className="text-cyan-400 ml-1">V2</span></span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${isWeb ? 'bg-indigo-950/80 text-indigo-300 border-indigo-500/40' : 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40'}`}>
              {isWeb && <Cloud size={9}/>} {isWeb ? 'WEB // CLOUDFLARE' : 'DESKTOP ENVIRONMENT'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-400"><span>STATE: <strong className="text-cyan-300">{coreState}</strong></span><span>//</span><span>MODE: <strong className="text-gray-200">{activeMode}</strong></span></div>
        </div>
      </div>

      <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button onClick={() => void toggleNetwork()} className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition ${network === 'ONLINE' ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400' : 'bg-gray-800/60 border-gray-700 text-gray-400'}`} title="Toggle Online/Offline Connectivity">
          {network === 'ONLINE' ? <Wifi size={12}/> : <WifiOff size={12}/>}<span className="text-[10px] font-bold">{network}</span>
        </button>
        <button onClick={onOpenSecurity} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/40 transition">
          <Shield size={12}/><span className="text-[10px] font-bold">{isWeb ? 'WEB SECURITY CONTROLS' : 'SECURITY: L0-L5 ENFORCED'}</span>
        </button>
      </div>

      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {isStopped ? <button onClick={handleStopToggle} className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-500 text-black font-bold"><RotateCcw size={14}/><span>RESET EMERGENCY STOP</span></button> : <button onClick={handleStopToggle} className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold shadow-lg shadow-red-600/40"><AlertOctagon size={14}/><span>STOP MIO</span></button>}
        {!isWeb && <div className="flex items-center gap-1 border-l border-gray-800 pl-3">
          <button onClick={() => window.mioDesktop?.minimizeWindow()} className="p-1.5 text-gray-400 hover:text-cyan-300 hover:bg-gray-800 rounded" title="Minimize"><Minus size={13}/></button>
          <button onClick={() => window.mioDesktop?.maximizeWindow()} className="p-1.5 text-gray-400 hover:text-cyan-300 hover:bg-gray-800 rounded" title="Maximize / Restore"><Square size={12}/></button>
          <button onClick={() => window.mioDesktop?.closeWindow()} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-950/60 rounded" title="Close"><X size={14}/></button>
        </div>}
      </div>
    </header>
  );
};

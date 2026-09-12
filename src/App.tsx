import React, { useState, useEffect } from 'react';
import { MioCoreState, MioSystemMode } from './types/core';
import { DryRunRequest } from './types/security';
import { eventBus } from './core/EventBus';
import { TopBar } from './components/layout/TopBar';
import { ModeNavigation } from './components/layout/ModeNavigation';
import { ContextPanel } from './components/layout/ContextPanel';
import { PermissionModal } from './security/PermissionModal';
import { FirstRunWizard } from './components/wizard/FirstRunWizard';

import { ChatStudioView } from './modes/chat/ChatStudioView';
import { Studio3DView } from './modes/studio3d/Studio3DView';
import { AnimationStudioView } from './modes/animation/AnimationStudioView';
import { GraphicStudioView } from './modes/graphic/GraphicStudioView';
import { SFXStudioView } from './modes/sfx/SFXStudioView';
import { MusicStudioView } from './modes/music/MusicStudioView';
import { ResearchStudioView } from './modes/research/ResearchStudioView';
import { FileOrganizationView } from './modes/files/FileOrganizationView';
import { MotionTrackingView } from './modes/motion/MotionTrackingView';
import { SecurityDashboardView } from './modes/security/SecurityDashboardView';
import { ProjectOverviewView } from './modes/project/ProjectOverviewView';
import { SettingsView } from './modes/settings/SettingsView';

const validModes: MioSystemMode[] = ['CHAT','RESEARCH','FILES','MOTION','3D','ANIMATION','GRAPHIC','SFX','MUSIC','PROJECT','SECURITY','SETTINGS'];

export const App: React.FC = () => {
  const [coreState, setCoreState] = useState<MioCoreState>('IDLE');
  const [activeMode, setActiveMode] = useState<MioSystemMode>('CHAT');
  const [dryRunRequest, setDryRunRequest] = useState<DryRunRequest | null>(null);
  const [showWizard, setShowWizard] = useState<boolean>(() => localStorage.getItem('mio_v2_setup_completed') !== 'true');

  useEffect(() => {
    const unsubState = eventBus.on('CORE_STATE_CHANGE', (state: MioCoreState) => setCoreState(state));
    const unsubMode = eventBus.on('SWITCH_MODE', (mode: MioSystemMode) => setActiveMode(mode));
    const unsubPerm = eventBus.on('REQUEST_DRY_RUN_PERMISSION', (req: DryRunRequest) => setDryRunRequest(req));
    const unsubDesktopNav = window.mioDesktop?.onNavigate((mode) => {
      if (validModes.includes(mode as MioSystemMode)) setActiveMode(mode as MioSystemMode);
    });

    return () => {
      unsubState();
      unsubMode();
      unsubPerm();
      unsubDesktopNav?.();
    };
  }, []);

  const renderActiveWorkspace = () => {
    switch (activeMode) {
      case 'CHAT': return <ChatStudioView />;
      case '3D': return <Studio3DView />;
      case 'ANIMATION': return <AnimationStudioView />;
      case 'GRAPHIC': return <GraphicStudioView />;
      case 'SFX': return <SFXStudioView />;
      case 'MUSIC': return <MusicStudioView />;
      case 'RESEARCH': return <ResearchStudioView />;
      case 'FILES': return <FileOrganizationView />;
      case 'MOTION': return <MotionTrackingView />;
      case 'SECURITY': return <SecurityDashboardView />;
      case 'PROJECT': return <ProjectOverviewView />;
      case 'SETTINGS': return <SettingsView />;
      default: return <ChatStudioView />;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#07090e] text-slate-200 overflow-hidden font-sans select-none">
      <TopBar coreState={coreState} activeMode={activeMode} onOpenSecurity={() => setActiveMode('SECURITY')} />
      <div className="flex flex-1 overflow-hidden">
        <ModeNavigation activeMode={activeMode} onSelectMode={setActiveMode} />
        <main className="flex-1 h-full overflow-hidden relative flex flex-col">{renderActiveWorkspace()}</main>
        <ContextPanel />
      </div>
      <PermissionModal request={dryRunRequest} onClose={() => setDryRunRequest(null)} />
      {showWizard && <FirstRunWizard onComplete={() => setShowWizard(false)} />}
    </div>
  );
};

export default App;

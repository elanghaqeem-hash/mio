import React, { useState, useEffect } from 'react';
import { MioCoreState, MioSystemMode } from './types/core';
import { DryRunRequest } from './types/security';
import { eventBus } from './core/EventBus';
import { TopBar } from './components/layout/TopBar';
import { ModeNavigation } from './components/layout/ModeNavigation';
import { ContextPanel } from './components/layout/ContextPanel';
import { PermissionModal } from './security/PermissionModal';
import { FirstRunWizard } from './components/wizard/FirstRunWizard';

// Studios
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

export const App: React.FC = () => {
  const [coreState, setCoreState] = useState<MioCoreState>('IDLE');
  const [activeMode, setActiveMode] = useState<MioSystemMode>('CHAT');
  const [dryRunRequest, setDryRunRequest] = useState<DryRunRequest | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [showWizard, setShowWizard] = useState<boolean>(() => {
    return localStorage.getItem('mio_v2_setup_completed') !== 'true';
  });

  useEffect(() => {
    const unsubState = eventBus.on('CORE_STATE_CHANGE', (state: MioCoreState) => setCoreState(state));
    const unsubMode = eventBus.on('SWITCH_MODE', (mode: MioSystemMode) => {
      setActiveMode(mode);
      setMobileNavOpen(false);
      setMobileContextOpen(false);
    });
    const unsubPerm = eventBus.on('REQUEST_DRY_RUN_PERMISSION', (req: DryRunRequest) => {
      setDryRunRequest(req);
    });

    return () => {
      unsubState();
      unsubMode();
      unsubPerm();
    };
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
    setMobileContextOpen(false);
  }, [activeMode]);

  const selectMode = (mode: MioSystemMode) => {
    setActiveMode(mode);
    setMobileNavOpen(false);
    setMobileContextOpen(false);
  };

  const renderActiveWorkspace = () => {
    switch (activeMode) {
      case 'CHAT':
        return <ChatStudioView />;
      case '3D':
        return <Studio3DView />;
      case 'ANIMATION':
        return <AnimationStudioView />;
      case 'GRAPHIC':
        return <GraphicStudioView />;
      case 'SFX':
        return <SFXStudioView />;
      case 'MUSIC':
        return <MusicStudioView />;
      case 'RESEARCH':
        return <ResearchStudioView />;
      case 'FILES':
        return <FileOrganizationView />;
      case 'MOTION':
        return <MotionTrackingView />;
      case 'SECURITY':
        return <SecurityDashboardView />;
      case 'PROJECT':
        return <ProjectOverviewView />;
      case 'SETTINGS':
        return <SettingsView />;
      default:
        return <ChatStudioView />;
    }
  };

  return (
    <div className="mio-app-shell flex flex-col h-[100dvh] min-h-[100svh] w-full max-w-full bg-[#07090e] text-slate-200 overflow-hidden font-sans select-none">
      <TopBar
        coreState={coreState}
        activeMode={activeMode}
        onOpenSecurity={() => selectMode('SECURITY')}
        onToggleNavigation={() => {
          setMobileNavOpen((open) => !open);
          setMobileContextOpen(false);
        }}
        onToggleContext={() => {
          setMobileContextOpen((open) => !open);
          setMobileNavOpen(false);
        }}
      />

      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
        <div className="hidden lg:flex shrink-0">
          <ModeNavigation activeMode={activeMode} onSelectMode={selectMode} />
        </div>

        <main className="mio-workspace flex-1 min-w-0 min-h-0 h-full overflow-auto lg:overflow-hidden relative flex flex-col overscroll-contain">
          {renderActiveWorkspace()}
        </main>

        <div className="hidden xl:flex shrink-0">
          <ContextPanel />
        </div>

        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-x-0 bottom-0 top-[var(--mio-mobile-header-height)] z-40 flex">
            <button
              type="button"
              aria-label="Close workspace navigation"
              onClick={() => setMobileNavOpen(false)}
              className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            />
            <div className="relative h-full max-w-[88vw] shadow-2xl shadow-black/60">
              <ModeNavigation activeMode={activeMode} onSelectMode={selectMode} mobile />
            </div>
          </div>
        )}

        {mobileContextOpen && (
          <div className="xl:hidden fixed inset-x-0 bottom-0 top-[var(--mio-mobile-header-height)] z-40 flex justify-end">
            <button
              type="button"
              aria-label="Close context panel"
              onClick={() => setMobileContextOpen(false)}
              className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            />
            <div className="relative h-full max-w-[92vw] shadow-2xl shadow-black/60">
              <ContextPanel mobile />
            </div>
          </div>
        )}
      </div>

      <PermissionModal
        request={dryRunRequest}
        onClose={() => setDryRunRequest(null)}
      />

      {showWizard && (
        <FirstRunWizard onComplete={() => setShowWizard(false)} />
      )}
    </div>
  );
};

export default App;

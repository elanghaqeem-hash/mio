import React, { Suspense, lazy, useEffect, useState } from 'react';
import { MioCoreState, MioSystemMode } from './types/core';
import { DryRunRequest } from './types/security';
import { eventBus } from './core/EventBus';
import { TopBar } from './components/layout/TopBar';
import { ModeNavigation } from './components/layout/ModeNavigation';
import { ContextPanel } from './components/layout/ContextPanel';
import { PermissionModal } from './security/PermissionModal';
import { FirstRunWizard } from './components/wizard/FirstRunWizard';

const ChatStudioView = lazy(() => import('./modes/chat/ChatStudioView').then((m) => ({ default: m.ChatStudioView })));
const Studio3DView = lazy(() => import('./modes/studio3d/Studio3DView').then((m) => ({ default: m.Studio3DView })));
const AnimationStudioView = lazy(() => import('./modes/animation/AnimationStudioView').then((m) => ({ default: m.AnimationStudioView })));
const GraphicStudioView = lazy(() => import('./modes/graphic/GraphicStudioView').then((m) => ({ default: m.GraphicStudioView })));
const SFXStudioView = lazy(() => import('./modes/sfx/SFXStudioView').then((m) => ({ default: m.SFXStudioView })));
const MusicStudioView = lazy(() => import('./modes/music/MusicStudioView').then((m) => ({ default: m.MusicStudioView })));
const ResearchStudioView = lazy(() => import('./modes/research/ResearchStudioView').then((m) => ({ default: m.ResearchStudioView })));
const FileOrganizationView = lazy(() => import('./modes/files/FileOrganizationView').then((m) => ({ default: m.FileOrganizationView })));
const MotionTrackingView = lazy(() => import('./modes/motion/MotionTrackingView').then((m) => ({ default: m.MotionTrackingView })));
const SecurityDashboardView = lazy(() => import('./modes/security/SecurityDashboardView').then((m) => ({ default: m.SecurityDashboardView })));
const ProjectOverviewView = lazy(() => import('./modes/project/ProjectOverviewView').then((m) => ({ default: m.ProjectOverviewView })));
const SettingsView = lazy(() => import('./modes/settings/SettingsView').then((m) => ({ default: m.SettingsView })));

const WorkspaceLoader = () => (
  <div className="h-full w-full flex items-center justify-center bg-[#07090e] font-mono text-xs text-cyan-400">
    <div className="border border-cyan-500/20 bg-[#0d121d] rounded-xl px-5 py-3 animate-pulse">LOADING MIO WORKSPACE...</div>
  </div>
);

export const App: React.FC = () => {
  const [coreState, setCoreState] = useState<MioCoreState>('IDLE');
  const [activeMode, setActiveMode] = useState<MioSystemMode>('CHAT');
  const [dryRunRequest, setDryRunRequest] = useState<DryRunRequest | null>(null);
  const [showWizard, setShowWizard] = useState<boolean>(() => localStorage.getItem('mio_v2_setup_completed') !== 'true');

  useEffect(() => {
    const unsubState = eventBus.on('CORE_STATE_CHANGE', (state: MioCoreState) => setCoreState(state));
    const unsubMode = eventBus.on('SWITCH_MODE', (mode: MioSystemMode) => setActiveMode(mode));
    const unsubPerm = eventBus.on('REQUEST_DRY_RUN_PERMISSION', (req: DryRunRequest) => setDryRunRequest(req));
    return () => { unsubState(); unsubMode(); unsubPerm(); };
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
        <main className="flex-1 h-full overflow-hidden relative flex flex-col">
          <Suspense fallback={<WorkspaceLoader />}>{renderActiveWorkspace()}</Suspense>
        </main>
        <ContextPanel />
      </div>
      <PermissionModal request={dryRunRequest} onClose={() => setDryRunRequest(null)} />
      {showWizard && <FirstRunWizard onComplete={() => setShowWizard(false)} />}
    </div>
  );
};

export default App;

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { MioCoreState, MioSystemMode } from './types/core';
import { DryRunRequest } from './types/security';
import { eventBus } from './core/EventBus';
import { TopBar } from './components/layout/TopBar';
import { ModeNavigation } from './components/layout/ModeNavigation';
import { ContextPanel } from './components/layout/ContextPanel';
import { PermissionModal } from './security/PermissionModal';
import { FirstRunWizard } from './components/wizard/FirstRunWizard';
import { AgentCommandCenter } from './modes/home/AgentCommandCenter';
import { StudioCopilotDock } from './components/layout/StudioCopilotDock';
import { ChatStudioView } from './modes/chat/ChatStudioView';

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
const TaskMonitorView = lazy(() => import('./modes/tasks/TaskMonitorView').then((m) => ({ default: m.TaskMonitorView })));
const SettingsView = lazy(() => import('./modes/settings/SettingsView').then((m) => ({ default: m.SettingsView })));

const WorkspaceLoader = () => (
  <div className="h-full w-full flex items-center justify-center bg-[#07090e] font-mono text-xs text-cyan-400">
    <div className="border border-cyan-500/20 bg-[#0d121d] rounded-xl px-5 py-3 animate-pulse">LOADING MIO WORKSPACE...</div>
  </div>
);

export const App: React.FC = () => {
  const agenticInterfaceEnabled = import.meta.env.VITE_MIO_AGENTIC_UI !== 'false' && localStorage.getItem('mio_agentic_ui') !== 'legacy';
  const [coreState, setCoreState] = useState<MioCoreState>('IDLE');
  const [activeMode, setActiveMode] = useState<MioSystemMode>('CHAT');
  const [dryRunRequest, setDryRunRequest] = useState<DryRunRequest | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [showWizard, setShowWizard] = useState<boolean>(() => localStorage.getItem('mio_v2_setup_completed') !== 'true');

  useEffect(() => {
    const unsubState = eventBus.on('CORE_STATE_CHANGE', (state: MioCoreState) => setCoreState(state));
    const unsubMode = eventBus.on('SWITCH_MODE', (mode: MioSystemMode) => {
      setActiveMode(mode);
      setMobileNavOpen(false);
      setMobileContextOpen(false);
    });
    const unsubPerm = eventBus.on('REQUEST_DRY_RUN_PERMISSION', (req: DryRunRequest) => setDryRunRequest(req));
    return () => { unsubState(); unsubMode(); unsubPerm(); };
  }, []);

  const selectMode = (mode: MioSystemMode) => {
    setActiveMode(mode);
    setMobileNavOpen(false);
    setMobileContextOpen(false);
  };

  const renderActiveWorkspace = () => {
    switch (activeMode) {
      case 'CHAT': return agenticInterfaceEnabled ? <AgentCommandCenter coreState={coreState} onSelectMode={selectMode} /> : <ChatStudioView />;
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
      case 'TASKS': return <TaskMonitorView />;
      case 'SETTINGS': return <SettingsView />;
      default: return agenticInterfaceEnabled ? <AgentCommandCenter coreState={coreState} onSelectMode={selectMode} /> : <ChatStudioView />;
    }
  };

  return (
    <div className="mio-app-shell flex h-[100dvh] min-h-[100svh] w-full max-w-full flex-col overflow-hidden bg-[#07090e] font-sans text-slate-200 select-none">
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
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="hidden shrink-0 lg:flex">
          <ModeNavigation activeMode={activeMode} onSelectMode={selectMode} />
        </div>
        <main className="mio-workspace relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-auto overscroll-contain lg:overflow-hidden">
          <Suspense fallback={<WorkspaceLoader />}>{renderActiveWorkspace()}</Suspense>
          {agenticInterfaceEnabled && activeMode !== 'CHAT' && <StudioCopilotDock state={coreState} mode={activeMode} onOpenCore={() => selectMode('CHAT')} />}
        </main>
        <div className="hidden shrink-0 xl:flex">
          <ContextPanel />
        </div>

        {mobileNavOpen && (
          <div className="fixed inset-x-0 bottom-0 top-[var(--mio-mobile-header-height)] z-40 flex lg:hidden">
            <button type="button" aria-label="Close workspace navigation" onClick={() => setMobileNavOpen(false)} className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
            <div className="relative h-full max-w-[88vw] shadow-2xl shadow-black/60">
              <ModeNavigation activeMode={activeMode} onSelectMode={selectMode} mobile />
            </div>
          </div>
        )}

        {mobileContextOpen && (
          <div className="fixed inset-x-0 bottom-0 top-[var(--mio-mobile-header-height)] z-40 flex justify-end xl:hidden">
            <button type="button" aria-label="Close context panel" onClick={() => setMobileContextOpen(false)} className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
            <div className="relative h-full max-w-[92vw] shadow-2xl shadow-black/60">
              <ContextPanel mobile />
            </div>
          </div>
        )}
      </div>
      <PermissionModal key={dryRunRequest?.id ?? 'no-permission-request'} request={dryRunRequest} onClose={() => setDryRunRequest(null)} />
      {showWizard && <FirstRunWizard onComplete={() => setShowWizard(false)} />}
    </div>
  );
};

export default App;

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { MioCoreState, MioSystemMode } from './types/core';
import { DryRunRequest } from './types/security';
import { eventBus } from './core/EventBus';
import { installMioVoiceRuntime, mioVoice } from './services/MioVoiceService';
import { TopBar } from './components/layout/TopBar';
import { ModeNavigation } from './components/layout/ModeNavigation';
import { ContextPanel } from './components/layout/ContextPanel';
import { PermissionModal } from './security/PermissionModal';
import { FirstRunWizard } from './components/wizard/FirstRunWizard';
import { AgentCommandCenter } from './modes/home/AgentCommandCenter';
import { StudioCopilotDock } from './components/layout/StudioCopilotDock';
import { ChatStudioView } from './modes/chat/ChatStudioView';
import './core-shell.css';

const Studio3DView = lazy(() => import('./modes/studio3d/Studio3DView').then((m) => ({ default: m.Studio3DView })));
const AnimationStudioView = lazy(() => import('./modes/animation/AnimationStudioView').then((m) => ({ default: m.AnimationStudioView })));
const GraphicStudioView = lazy(() => import('./modes/graphic/GraphicStudioView').then((m) => ({ default: m.GraphicStudioView })));
const DrawingStudioView = lazy(() => import('./modes/drawing/DrawingStudioView').then((m) => ({ default: m.DrawingStudioView })));
const PhotoStudioView = lazy(() => import('./modes/photo/PhotoStudioView').then((m) => ({ default: m.PhotoStudioView })));
const Motion2DStudioView = lazy(() => import('./modes/motion2d/Motion2DStudioView').then((m) => ({ default: m.Motion2DStudioView })));
const SFXStudioView = lazy(() => import('./modes/sfx/SFXStudioView').then((m) => ({ default: m.SFXStudioView })));
const MusicStudioView = lazy(() => import('./modes/music/MusicStudioView').then((m) => ({ default: m.MusicStudioView })));
const ResearchStudioView = lazy(() => import('./modes/research/ResearchStudioView').then((m) => ({ default: m.ResearchStudioView })));
const FileOrganizationView = lazy(() => import('./modes/files/FileOrganizationView').then((m) => ({ default: m.FileOrganizationView })));
const MotionTrackingView = lazy(() => import('./modes/motion/MotionTrackingView').then((m) => ({ default: m.MotionTrackingView })));
const SecurityDashboardView = lazy(() => import('./modes/security/SecurityDashboardView').then((m) => ({ default: m.SecurityDashboardView })));
const ProjectOverviewView = lazy(() => import('./modes/project/ProjectOverviewView').then((m) => ({ default: m.ProjectOverviewView })));
const TaskMonitorView = lazy(() => import('./modes/tasks/TaskMonitorView').then((m) => ({ default: m.TaskMonitorView })));
const SettingsView = lazy(() => import('./modes/settings/SettingsView').then((m) => ({ default: m.SettingsView })));

const WORKSPACE_LABELS: Record<MioSystemMode, string> = {
  CHAT: 'Mio Core', RESEARCH: 'Research Studio', FILES: 'File Sandbox', MOTION: 'Motion Tracking', '3D': '3D Modeling Studio',
  ANIMATION: 'Animation Studio', MOTION_2D: '2D / Motion Studio', GRAPHIC: 'Graphic Design Studio', DRAWING: 'Drawing Studio',
  PHOTO: 'Photo Editing Studio', SFX: 'SFX Studio', MUSIC: 'Music Studio', PROJECT: 'Project Context', TASKS: 'Mission Control',
  SECURITY: 'Security Center', SETTINGS: 'System Settings',
};

const WorkspaceLoader = () => (
  <div className="h-full w-full flex items-center justify-center bg-[#07111d] font-mono text-xs text-sky-300">
    <div className="border border-sky-300/20 bg-[#0b1b2d] rounded-xl px-5 py-3 animate-pulse">LOADING MIO WORKSPACE...</div>
  </div>
);

export const App: React.FC = () => {
  const agenticInterfaceEnabled = import.meta.env.VITE_MIO_AGENTIC_UI !== 'false' && localStorage.getItem('mio_agentic_ui') !== 'legacy';
  const [coreState, setCoreState] = useState<MioCoreState>('IDLE');
  const [activeMode, setActiveMode] = useState<MioSystemMode>('CHAT');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [dryRunRequest, setDryRunRequest] = useState<DryRunRequest | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [showWizard, setShowWizard] = useState<boolean>(() => localStorage.getItem('mio_v2_setup_completed') !== 'true');

  useEffect(() => {
    installMioVoiceRuntime();
    return mioVoice.subscribe((voiceState) => {
      if (voiceState === 'SPEAKING') eventBus.emit('CORE_STATE_CHANGE', 'SPEAKING');
      else eventBus.emit('CORE_STATE_CHANGE', 'IDLE');
    });
  }, []);

  useEffect(() => {
    const unsubState = eventBus.on('CORE_STATE_CHANGE', (state: MioCoreState) => setCoreState(state));
    const unsubMode = eventBus.on('SWITCH_MODE', (mode: MioSystemMode) => { setActiveMode(mode); setWorkspaceOpen(mode !== 'CHAT'); setNavigationOpen(false); setContextOpen(false); });
    const unsubPerm = eventBus.on('REQUEST_DRY_RUN_PERMISSION', (req: DryRunRequest) => setDryRunRequest(req));
    return () => { unsubState(); unsubMode(); unsubPerm(); };
  }, []);

  useEffect(() => {
    if (!workspaceOpen && !navigationOpen && !contextOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (contextOpen) setContextOpen(false);
      else if (navigationOpen) setNavigationOpen(false);
      else { setWorkspaceOpen(false); setActiveMode('CHAT'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [workspaceOpen, navigationOpen, contextOpen]);

  const selectMode = (mode: MioSystemMode) => { setActiveMode(mode); setWorkspaceOpen(mode !== 'CHAT'); setNavigationOpen(false); setContextOpen(false); };
  const closeWorkspace = () => { setWorkspaceOpen(false); setActiveMode('CHAT'); };
  const renderActiveWorkspace = () => {
    switch (activeMode) {
      case 'CHAT': return <ChatStudioView />; case '3D': return <Studio3DView />; case 'ANIMATION': return <AnimationStudioView />;
      case 'GRAPHIC': return <GraphicStudioView />; case 'DRAWING': return <DrawingStudioView />; case 'PHOTO': return <PhotoStudioView />;
      case 'MOTION_2D': return <Motion2DStudioView />; case 'SFX': return <SFXStudioView />; case 'MUSIC': return <MusicStudioView />;
      case 'RESEARCH': return <ResearchStudioView />; case 'FILES': return <FileOrganizationView />; case 'MOTION': return <MotionTrackingView />;
      case 'SECURITY': return <SecurityDashboardView />; case 'PROJECT': return <ProjectOverviewView />; case 'TASKS': return <TaskMonitorView />;
      case 'SETTINGS': return <SettingsView />; default: return <ChatStudioView />;
    }
  };

  return (
    <div className="mio-app-shell mio-core-first-shell flex h-[100dvh] min-h-[100svh] w-full max-w-full flex-col overflow-hidden font-sans text-slate-200 select-none">
      <TopBar coreState={coreState} activeMode={workspaceOpen ? activeMode : 'CHAT'} onOpenSecurity={() => selectMode('SECURITY')}
        onToggleNavigation={() => { setNavigationOpen((open) => !open); setContextOpen(false); }}
        onToggleContext={() => { setContextOpen((open) => !open); setNavigationOpen(false); }} />
      <main className="mio-core-stage relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <Suspense fallback={<WorkspaceLoader />}>{agenticInterfaceEnabled ? <AgentCommandCenter coreState={coreState} onSelectMode={selectMode} /> : <ChatStudioView />}</Suspense>
      </main>
      {workspaceOpen && activeMode !== 'CHAT' && (
        <div className="mio-workspace-overlay" role="presentation">
          <button type="button" aria-label="Close current workspace" onClick={closeWorkspace} className="mio-overlay-backdrop" />
          <section className="mio-workspace-popup" role="dialog" aria-modal="true" aria-label={`${WORKSPACE_LABELS[activeMode]} workspace`}>
            <header className="mio-workspace-popup-header"><div className="min-w-0"><p className="mio-popup-kicker">MIO WORKSPACE // POPUP</p><div className="flex min-w-0 items-center gap-2"><h2 className="truncate text-sm font-semibold text-slate-100 sm:text-base">{WORKSPACE_LABELS[activeMode]}</h2><span className="mio-popup-live-chip">ACTIVE</span></div></div><div className="flex items-center gap-2"><button type="button" onClick={() => setNavigationOpen(true)} className="mio-popup-action">SWITCH</button><button type="button" onClick={closeWorkspace} className="mio-popup-close" aria-label="Close workspace">×</button></div></header>
            <div className="mio-workspace-popup-body"><Suspense fallback={<WorkspaceLoader />}>{renderActiveWorkspace()}</Suspense>{agenticInterfaceEnabled && <StudioCopilotDock state={coreState} mode={activeMode} onOpenCore={closeWorkspace} />}</div>
          </section>
        </div>
      )}
      {navigationOpen && <div className="mio-panel-overlay mio-navigation-overlay"><button type="button" aria-label="Close workspace navigation" onClick={() => setNavigationOpen(false)} className="mio-overlay-backdrop" /><div className="mio-navigation-popup"><ModeNavigation activeMode={workspaceOpen ? activeMode : 'CHAT'} onSelectMode={selectMode} mobile /></div></div>}
      {contextOpen && <div className="mio-panel-overlay mio-context-overlay"><button type="button" aria-label="Close context panel" onClick={() => setContextOpen(false)} className="mio-overlay-backdrop" /><div className="mio-context-popup"><ContextPanel mobile /></div></div>}
      <PermissionModal key={dryRunRequest?.id ?? 'no-permission-request'} request={dryRunRequest} onClose={() => setDryRunRequest(null)} />
      {showWizard && <FirstRunWizard onComplete={() => setShowWizard(false)} />}
    </div>
  );
};

export default App;
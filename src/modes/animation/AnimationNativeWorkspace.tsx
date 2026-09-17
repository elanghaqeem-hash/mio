import React from 'react';
import type { MioAnimationProject } from '../../types/creative';
import { CreativeWorkspaceToolbar } from '../../components/creative/CreativeWorkspaceToolbar';
import { useCreativeStudioDocument } from '../../creative/useCreativeStudioDocument';
import { Animation3DViewportBridge } from './Animation3DViewportBridge';
import { AnimationEditorWorkspaceProvider, useAnimationEditorWorkspace } from './AnimationEditorWorkspaceContext';

const INITIAL_PROJECT: MioAnimationProject = {
  duration: 5,
  fps: 60,
  currentTime: 0,
  loop: true,
  tracks: [],
  rigs: [{
    id: 'rig_vanguard',
    name: 'Vanguard Rig',
    objectId: 'Vanguard_Mech_Hull',
    bones: [
      { id: 'root', name: 'Root', length: 1.2, connected: false, ikFk: 'FK', pose: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { id: 'spine', name: 'Spine', parentId: 'root', length: 1, connected: true, ikFk: 'FK', pose: { position: [0, 1.2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      { id: 'arm_l', name: 'Arm.L', parentId: 'spine', length: .9, connected: false, ikFk: 'FK', pose: { position: [-.55, .7, 0], rotation: [0, 0, .35], scale: [1, 1, 1] } },
      { id: 'arm_r', name: 'Arm.R', parentId: 'spine', length: .9, connected: false, ikFk: 'FK', pose: { position: [.55, .7, 0], rotation: [0, 0, -.35], scale: [1, 1, 1] } },
    ],
  }],
};

const NativeViewportSurface: React.FC<{ project: MioAnimationProject; onCommitProject: (project: MioAnimationProject) => void }> = ({ project, onCommitProject }) => {
  const { editor, setEditor } = useAnimationEditorWorkspace();
  return (
    <main className="relative min-h-0 flex-1 overflow-hidden bg-[#0d1117]" aria-label="Native 3D animation viewport">
      <Animation3DViewportBridge project={project} editor={editor} setEditor={setEditor} onCommitProject={onCommitProject} />
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-gray-300">
        Native WebGL · Tap joint: Select · Drag: Pose/Orbit · Wheel/Pinch: Zoom
      </div>
    </main>
  );
};

export const AnimationNativeWorkspace: React.FC = () => {
  const workspace = useCreativeStudioDocument<MioAnimationProject>('MIO_3D_Animation.mioanim', INITIAL_PROJECT);
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#16191d] text-gray-200">
      <CreativeWorkspaceToolbar workspace={workspace} />
      <div className="flex h-9 shrink-0 items-center border-b border-black bg-[#25292e] px-3 font-mono text-xs">
        <b className="text-orange-300">3D ANIMATION STUDIO</b>
        <span className="ml-2 text-gray-500">Authoritative Native Workspace</span>
      </div>
      <AnimationEditorWorkspaceProvider project={workspace.state}>
        <NativeViewportSurface project={workspace.state} onCommitProject={workspace.setState} />
      </AnimationEditorWorkspaceProvider>
    </div>
  );
};

export default AnimationNativeWorkspace;

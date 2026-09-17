import React, { useMemo, useState } from 'react';
import type { MioAnimationProject } from '../../types/creative';
import { useCreativeStudioDocument } from '../../creative/useCreativeStudioDocument';
import { Animation3DViewport } from './Animation3DViewport';
import { DEFAULT_POSE_CONTROL_STATE, selectBone, setPoseAutoKey, setPoseAxis, setPoseTool, type PoseControlState } from './PoseControlModel';
import { beginNativePoseDrag, cancelNativePoseDrag, commitNativePoseDrag, updateNativePoseDrag, type NativePoseViewportState } from './NativePoseViewportController';

const EMPTY_PROJECT: MioAnimationProject = { duration: 10, fps: 24, currentTime: 0, loop: true, tracks: [], rigs: [] };

/** Native WebGL authoring bridge: one persisted animation workspace, one pose transaction. */
export const Animation3DViewportBridge: React.FC = () => {
  const workspace = useCreativeStudioDocument<MioAnimationProject>('MIO_3D_Animation.mioanim', EMPTY_PROJECT);
  const [control, setControl] = useState<PoseControlState>(DEFAULT_POSE_CONTROL_STATE);
  const [sessionState, setSessionState] = useState<NativePoseViewportState>();
  const project = sessionState?.project ?? workspace.state;
  const currentTime = useMemo(() => Number.isFinite(project.currentTime) ? project.currentTime : 0, [project.currentTime]);
  const effectiveControl = sessionState?.control ?? control;

  const mutateControl = (next: (state: PoseControlState) => PoseControlState) => {
    setControl(previous => next(previous));
    setSessionState(undefined);
  };

  return <div className="relative h-full w-full">
    <Animation3DViewport
      project={project}
      time={currentTime}
      selectedRigId={effectiveControl.selection?.rigId}
      selectedBoneId={effectiveControl.selection?.boneId}
      onSelectBone={(rigId, boneId) => mutateControl(state => selectBone(state, rigId, boneId))}
      onPoseDragStart={(point) => {
        if (!effectiveControl.selection) return;
        const base: NativePoseViewportState = { project: workspace.state, control: effectiveControl };
        setSessionState(beginNativePoseDrag(base, point, 0.05));
      }}
      onPoseDrag={(point) => setSessionState(previous => previous ? updateNativePoseDrag(previous, point) : previous)}
      onPoseDragEnd={() => setSessionState(previous => {
        if (!previous?.session) return previous;
        const result = commitNativePoseDrag(previous);
        if (result.commit && Math.abs(result.commit.delta) > 0) workspace.setState(result.commit.project);
        setControl(result.control);
        return undefined;
      })}
      onPoseDragCancel={() => setSessionState(previous => previous?.session ? cancelNativePoseDrag(previous) : undefined)}
    />
    <div className="absolute right-3 top-3 z-10 flex gap-1 rounded bg-black/70 p-1 font-mono text-[10px] text-gray-200">
      <button onClick={() => mutateControl(s => setPoseTool(s, 'TRANSLATE'))} className={`rounded px-2 py-1 ${effectiveControl.tool === 'TRANSLATE' ? 'bg-blue-700' : 'bg-white/10'}`}>MOVE</button>
      <button onClick={() => mutateControl(s => setPoseTool(s, 'ROTATE'))} className={`rounded px-2 py-1 ${effectiveControl.tool === 'ROTATE' ? 'bg-blue-700' : 'bg-white/10'}`}>ROTATE</button>
      {(['x','y','z'] as const).map(axis => <button key={axis} onClick={() => mutateControl(s => setPoseAxis(s, axis))} className={`rounded px-2 py-1 uppercase ${effectiveControl.axis === axis ? 'bg-orange-700' : 'bg-white/10'}`}>{axis}</button>)}
      <button onClick={() => mutateControl(s => setPoseAutoKey(s, !s.autoKey))} className={`rounded px-2 py-1 ${effectiveControl.autoKey ? 'bg-red-700' : 'bg-white/10'}`}>● AUTO KEY</button>
    </div>
    {effectiveControl.selection && <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/65 px-2 py-1 font-mono text-[10px] text-gray-300">{effectiveControl.tool} · {effectiveControl.axis.toUpperCase()} · drag selected joint to pose</div>}
  </div>;
};

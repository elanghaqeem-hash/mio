import React, { useEffect, useMemo, useState } from 'react';
import type { MioAnimationProject } from '../../types/creative';
import { useCreativeStudioDocument } from '../../creative/useCreativeStudioDocument';
import { Animation3DViewport, type ViewPreset } from './Animation3DViewport';
import type { PointerPoint, ScreenAxis } from './TransformGizmoController';
import { DEFAULT_POSE_CONTROL_STATE, type PoseControlState } from './PoseControlModel';
import {
  beginNativePoseDrag,
  cancelNativePoseDrag,
  commitNativePoseDrag,
  updateNativePoseDrag,
  type NativePoseViewportState,
} from './NativePoseViewportController';
import {
  DEFAULT_ANIMATION_EDITOR_STATE,
  reconcileAnimationEditorState,
  requestFrameSelected,
  selectAnimationBone,
  setAnimationEditorAutoKey,
  setAnimationEditorAxis,
  setAnimationEditorOrientation,
  setAnimationEditorTool,
  setAnimationEditorViewPreset,
  type AnimationEditorState,
} from './AnimationEditorState';

const EMPTY_PROJECT: MioAnimationProject = {
  duration: 10,
  fps: 24,
  currentTime: 0,
  loop: true,
  tracks: [],
  rigs: [],
};

const validSelections = (project: MioAnimationProject) =>
  (project.rigs ?? []).flatMap((rig) =>
    rig.bones.map((bone) => ({ rigId: rig.id, boneId: bone.id })),
  );

const editorToControl = (
  editor: AnimationEditorState,
  control: PoseControlState,
): PoseControlState => ({
  ...control,
  selection: editor.selection,
  tool: editor.poseTool,
  axis: editor.poseAxis,
  autoKey: editor.autoKey,
});

export const Animation3DViewportBridge: React.FC = () => {
  const workspace = useCreativeStudioDocument<MioAnimationProject>(
    'MIO_3D_Animation.mioanim',
    EMPTY_PROJECT,
  );
  const [editor, setEditor] = useState<AnimationEditorState>(() => ({
    ...DEFAULT_ANIMATION_EDITOR_STATE,
    time: Number.isFinite(workspace.state.currentTime)
      ? workspace.state.currentTime
      : 0,
  }));
  const [control, setControl] = useState<PoseControlState>(
    DEFAULT_POSE_CONTROL_STATE,
  );
  const [session, setSession] = useState<NativePoseViewportState>();

  const project = session?.project ?? workspace.state;
  const reconciled = useMemo(
    () =>
      reconcileAnimationEditorState(
        editor,
        validSelections(project),
        project.duration,
      ),
    [editor, project],
  );

  useEffect(() => {
    const selectionChanged =
      reconciled.selection?.rigId !== editor.selection?.rigId ||
      reconciled.selection?.boneId !== editor.selection?.boneId;
    if (reconciled.time !== editor.time || selectionChanged) {
      setEditor(reconciled);
    }
  }, [editor, reconciled]);

  const effectiveControl =
    session?.control ?? editorToControl(reconciled, control);

  const mutateEditor = (
    next: (state: AnimationEditorState) => AnimationEditorState,
  ) => {
    setEditor((previous) => next(previous));
    setSession(undefined);
  };

  const syncControl = (nextEditor: AnimationEditorState) =>
    setControl((previous) => editorToControl(nextEditor, previous));

  return (
    <div className="relative h-full w-full">
      <Animation3DViewport
        project={project}
        time={reconciled.time}
        selectedRigId={reconciled.selection?.rigId}
        selectedBoneId={reconciled.selection?.boneId}
        poseTool={reconciled.poseTool}
        poseAxis={reconciled.poseAxis}
        transformOrientation={reconciled.orientation}
        viewPreset={reconciled.viewPreset}
        frameSelectedToken={reconciled.frameSelectedToken}
        onSelectBone={(rigId, boneId) =>
          mutateEditor((state) => {
            const next = selectAnimationBone(state, rigId, boneId);
            syncControl(next);
            return next;
          })
        }
        onPoseDragStart={(
          point: PointerPoint,
          axis: ScreenAxis,
          center?: PointerPoint,
        ) => {
          if (!reconciled.selection) return;
          const nextControl = editorToControl(reconciled, effectiveControl);
          setControl(nextControl);
          setSession(
            beginNativePoseDrag(
              { project: workspace.state, control: nextControl },
              point,
              0.05,
              axis,
              center,
            ),
          );
        }}
        onPoseDrag={(point) =>
          setSession((current) =>
            current ? updateNativePoseDrag(current, point) : current,
          )
        }
        onPoseDragEnd={() =>
          setSession((current) => {
            if (!current?.session) return current;
            const result = commitNativePoseDrag(current);
            if (result.commit && Math.abs(result.commit.delta) > 0) {
              workspace.setState(result.commit.project);
            }
            setControl(result.control);
            return undefined;
          })
        }
        onPoseDragCancel={() =>
          setSession((current) =>
            current?.session ? cancelNativePoseDrag(current) : undefined,
          )
        }
      />

      <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-1 rounded bg-black/70 p-1 font-mono text-[10px] text-gray-200">
        <button
          onClick={() =>
            mutateEditor((state) => {
              const next = setAnimationEditorTool(state, 'TRANSLATE');
              syncControl(next);
              return next;
            })
          }
          className={`rounded px-2 py-1 ${reconciled.poseTool === 'TRANSLATE' ? 'bg-blue-700' : 'bg-white/10'}`}
        >
          MOVE
        </button>
        <button
          onClick={() =>
            mutateEditor((state) => {
              const next = setAnimationEditorTool(state, 'ROTATE');
              syncControl(next);
              return next;
            })
          }
          className={`rounded px-2 py-1 ${reconciled.poseTool === 'ROTATE' ? 'bg-blue-700' : 'bg-white/10'}`}
        >
          ROTATE
        </button>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <button
            key={axis}
            onClick={() =>
              mutateEditor((state) => {
                const next = setAnimationEditorAxis(state, axis);
                syncControl(next);
                return next;
              })
            }
            className={`rounded px-2 py-1 uppercase ${reconciled.poseAxis === axis ? 'bg-orange-700' : 'bg-white/10'}`}
          >
            {axis}
          </button>
        ))}
        <button
          onClick={() =>
            mutateEditor((state) =>
              setAnimationEditorOrientation(
                state,
                state.orientation === 'WORLD' ? 'LOCAL' : 'WORLD',
              ),
            )
          }
          className={`rounded px-2 py-1 ${reconciled.orientation === 'LOCAL' ? 'bg-violet-700' : 'bg-white/10'}`}
        >
          {reconciled.orientation}
        </button>
        <button
          onClick={() =>
            mutateEditor((state) => {
              const next = setAnimationEditorAutoKey(state, !state.autoKey);
              syncControl(next);
              return next;
            })
          }
          className={`rounded px-2 py-1 ${reconciled.autoKey ? 'bg-red-700' : 'bg-white/10'}`}
        >
          ● AUTO KEY
        </button>
        <span className="mx-1 border-l border-white/20" />
        {(['PERSPECTIVE', 'FRONT', 'RIGHT', 'TOP'] as ViewPreset[]).map(
          (preset) => (
            <button
              key={preset}
              onClick={() =>
                mutateEditor((state) =>
                  setAnimationEditorViewPreset(state, preset),
                )
              }
              className={`rounded px-2 py-1 ${reconciled.viewPreset === preset ? 'bg-cyan-800' : 'bg-white/10'}`}
            >
              {preset === 'PERSPECTIVE' ? 'PERSP' : preset}
            </button>
          ),
        )}
        <button
          onClick={() => mutateEditor(requestFrameSelected)}
          className="rounded bg-white/10 px-2 py-1"
        >
          FRAME
        </button>
      </div>

      {reconciled.selection && (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/65 px-2 py-1 font-mono text-[10px] text-gray-300">
          {reconciled.orientation} ·{' '}
          {reconciled.poseTool === 'ROTATE'
            ? 'ARC ROTATION'
            : 'CAMERA-PROJECTED'}{' '}
          · {reconciled.poseAxis.toUpperCase()}
        </div>
      )}
    </div>
  );
};

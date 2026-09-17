import React, { useMemo, useState } from 'react';
import type { MioAnimationProject } from '../../types/creative';
import { useCreativeStudioDocument } from '../../creative/useCreativeStudioDocument';
import { Animation3DViewport } from './Animation3DViewport';

const EMPTY_PROJECT: MioAnimationProject = {
  duration: 10,
  fps: 24,
  currentTime: 0,
  loop: true,
  tracks: [],
  rigs: [],
};

/**
 * Keeps the WebGL viewport on the same persisted .mioanim document contract as
 * AnimationStudioView. The viewport is a consumer of the evaluated animation
 * runtime; authoring remains transactional through the canonical workspace.
 */
export const Animation3DViewportBridge: React.FC = () => {
  const workspace = useCreativeStudioDocument<MioAnimationProject>('MIO_3D_Animation.mioanim', EMPTY_PROJECT);
  const project = workspace.state;
  const [selection, setSelection] = useState<{ rigId?: string; boneId?: string }>({});
  const currentTime = useMemo(
    () => Number.isFinite(project.currentTime) ? project.currentTime : 0,
    [project.currentTime],
  );

  return (
    <Animation3DViewport
      project={project}
      time={currentTime}
      selectedRigId={selection.rigId}
      selectedBoneId={selection.boneId}
      onSelectBone={(rigId, boneId) => setSelection({ rigId, boneId })}
    />
  );
};

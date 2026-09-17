import React, { useMemo, useState } from 'react';
import type { MioAnimationProject } from '../../types/creative';
import { useCreativeStudioDocument } from '../shared/useCreativeStudioDocument';
import { Animation3DViewport } from './Animation3DViewport';

const EMPTY_PROJECT: MioAnimationProject = {
  id: 'mio-animation-empty',
  name: 'MIO 3D Animation',
  duration: 10,
  fps: 24,
  currentTime: 0,
  tracks: [],
  objects: [],
};

/** Keeps the WebGL viewport on the same persisted .mioanim document as the legacy editor. */
export const Animation3DViewportBridge: React.FC = () => {
  const { document } = useCreativeStudioDocument<MioAnimationProject>('ANIMATION', EMPTY_PROJECT);
  const project = document ?? EMPTY_PROJECT;
  const [selection, setSelection] = useState<{ rigId?: string; boneId?: string }>({});
  const currentTime = useMemo(() => Number.isFinite(project.currentTime) ? project.currentTime : 0, [project.currentTime]);

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

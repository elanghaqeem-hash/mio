import type { MioAnimationProject } from '../../types/creative';
import { evaluateAnimationProject } from './AnimationRuntime';
import { setBoneIKFK, setBonePose } from './PoseOperations';

export const switchBoneIKFKPreservePose = (project: MioAnimationProject, rigId: string, boneId: string, mode: 'IK' | 'FK', time = project.currentTime): MioAnimationProject => {
  if (!Number.isFinite(time)) throw new Error('IK/FK switch time must be finite');
  const rig = project.rigs?.find(r => r.id === rigId);
  const bone = rig?.bones.find(b => b.id === boneId);
  if (!rig || !bone) throw new Error(`Bone ${boneId} not found in rig ${rigId}`);
  if (bone.ikFk === mode) return project;
  if (mode !== 'FK') return setBoneIKFK(project, rigId, boneId, mode);

  const evaluated = evaluateAnimationProject(project, time).bonePoses;
  const chain: string[] = [];
  let current = bone;
  while (current) {
    chain.push(current.id);
    if (!current.parentId) break;
    const parent = rig.bones.find(candidate => candidate.id === current.parentId);
    if (!parent) break;
    current = parent;
  }
  let next = project;
  for (const id of chain.reverse()) {
    const pose = evaluated[`${rigId}:${id}`];
    if (pose) next = setBonePose(next, rigId, id, pose);
  }
  return setBoneIKFK(next, rigId, boneId, mode);
};

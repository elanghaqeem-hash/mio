import React, { useMemo } from 'react';
import type { AnimationRig, BonePose } from '../../types/creative';
import type { PoseControlState } from './PoseControlModel';
import { buildRigViewportModel } from './RigViewportModel';
import { projectRigViewportModel } from './RigViewportProjection';
import { selectBoneAtViewportPoint } from './RigViewportSelectionController';

export interface RigViewportOverlayProps {
  rig: AnimationRig;
  poses: Record<string, BonePose>;
  control: PoseControlState;
  width?: number;
  height?: number;
  onControlChange: (control: PoseControlState) => void;
}

export const RigViewportOverlay: React.FC<RigViewportOverlayProps> = ({
  rig,
  poses,
  control,
  width = 560,
  height = 420,
  onControlChange,
}) => {
  const projection = useMemo(() => ({ width, height }), [width, height]);
  const selectedBoneId = control.selection?.rigId === rig.id ? control.selection.boneId : undefined;
  const projected = useMemo(
    () => projectRigViewportModel(buildRigViewportModel(rig, poses, selectedBoneId), projection),
    [rig, poses, selectedBoneId, projection],
  );

  const selectAt = (clientX: number, clientY: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * width;
    const y = ((clientY - rect.top) / rect.height) * height;
    const result = selectBoneAtViewportPoint(control, rig, poses, [x, y], projection, 16);
    onControlChange(result.control);
  };

  return (
    <svg
      className="absolute inset-0 h-full w-full touch-none"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="application"
      aria-label={`${rig.name} pose rig viewport`}
      onPointerDown={event => {
        event.preventDefault();
        selectAt(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
      }}
    >
      <g aria-hidden="true">
        {projected.bones.map(bone => (
          <g key={bone.id}>
            <line
              x1={bone.head[0]}
              y1={bone.head[1]}
              x2={bone.tail[0]}
              y2={bone.tail[1]}
              stroke={bone.selected ? '#fb923c' : '#93c5fd'}
              strokeWidth={bone.selected ? 8 : 5}
              strokeLinecap="round"
              opacity={bone.selected ? 1 : 0.82}
            />
            <circle cx={bone.head[0]} cy={bone.head[1]} r={bone.selected ? 6 : 4} fill={bone.selected ? '#fdba74' : '#dbeafe'} />
            <circle cx={bone.tail[0]} cy={bone.tail[1]} r={3} fill={bone.ikFk === 'IK' ? '#c084fc' : '#bfdbfe'} />
            {bone.selected && (
              <text x={bone.head[0] + 9} y={bone.head[1] - 9} fill="#fed7aa" fontSize="11">
                {bone.name} · {bone.ikFk}
              </text>
            )}
          </g>
        ))}
      </g>
    </svg>
  );
};

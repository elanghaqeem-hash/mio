import React, { useMemo } from 'react';
import type { AnimationRig, BonePose } from '../../types/creative';
import type { PoseControlState } from './PoseControlModel';
import { buildRigViewportModel } from './RigViewportModel';
import { projectRigViewportModel, type ViewportPoint } from './RigViewportProjection';
import { selectBoneAtViewportPoint } from './RigViewportSelectionController';
import type { PointerPoint } from './TransformGizmoController';

export interface RigViewportOverlayProps {
  rig: AnimationRig;
  poses: Record<string, BonePose>;
  control: PoseControlState;
  width?: number;
  height?: number;
  onControlChange: (control: PoseControlState) => void;
  onTransformStart?: (point: PointerPoint) => void;
  onTransformMove?: (point: PointerPoint) => void;
  onTransformCommit?: () => void;
  onTransformCancel?: () => void;
}

export const RigViewportOverlay: React.FC<RigViewportOverlayProps> = ({
  rig,
  poses,
  control,
  width = 560,
  height = 420,
  onControlChange,
  onTransformStart,
  onTransformMove,
  onTransformCommit,
  onTransformCancel,
}) => {
  const projection = useMemo(() => ({ width, height }), [width, height]);
  const selectedBoneId = control.selection?.rigId === rig.id ? control.selection.boneId : undefined;
  const projected = useMemo(
    () => projectRigViewportModel(buildRigViewportModel(rig, poses, selectedBoneId), projection),
    [rig, poses, selectedBoneId, projection],
  );
  const selectedBone = projected.bones.find(bone => bone.id === selectedBoneId);

  const viewportPoint = (clientX: number, clientY: number, rect: DOMRect): ViewportPoint => {
    const scale = Math.min(rect.width / width, rect.height / height);
    const renderedWidth = width * scale;
    const renderedHeight = height * scale;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;
    return [
      (clientX - rect.left - offsetX) / scale,
      (clientY - rect.top - offsetY) / scale,
    ];
  };

  const pointerPoint = (event: React.PointerEvent<SVGSVGElement>): PointerPoint => {
    const [x, y] = viewportPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    return { x, y };
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
        const point = pointerPoint(event);
        const result = selectBoneAtViewportPoint(control, rig, poses, [point.x, point.y], projection, 16);
        onControlChange(result.control);
      }}
      onPointerMove={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onTransformMove?.(pointerPoint(event));
      }}
      onPointerUp={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        onTransformCommit?.();
      }}
      onPointerCancel={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        onTransformCancel?.();
      }}
    >
      <g aria-hidden="true">
        {projected.bones.map(bone => (
          <g key={bone.id}>
            <line x1={bone.head[0]} y1={bone.head[1]} x2={bone.tail[0]} y2={bone.tail[1]} stroke={bone.selected ? '#fb923c' : '#93c5fd'} strokeWidth={bone.selected ? 8 : 5} strokeLinecap="round" opacity={bone.selected ? 1 : 0.82} />
            <circle cx={bone.head[0]} cy={bone.head[1]} r={bone.selected ? 6 : 4} fill={bone.selected ? '#fdba74' : '#dbeafe'} />
            <circle cx={bone.tail[0]} cy={bone.tail[1]} r={3} fill={bone.ikFk === 'IK' ? '#c084fc' : '#bfdbfe'} />
            {bone.selected && <text x={bone.head[0] + 9} y={bone.head[1] - 9} fill="#fed7aa" fontSize="11">{bone.name} · {bone.ikFk}</text>}
          </g>
        ))}
        {selectedBone && (
          <g>
            <line x1={selectedBone.head[0]} y1={selectedBone.head[1]} x2={selectedBone.head[0] + 48} y2={selectedBone.head[1]} stroke="#ef4444" strokeWidth="4" />
            <line x1={selectedBone.head[0]} y1={selectedBone.head[1]} x2={selectedBone.head[0]} y2={selectedBone.head[1] - 48} stroke="#22c55e" strokeWidth="4" />
            <line x1={selectedBone.head[0]} y1={selectedBone.head[1]} x2={selectedBone.head[0] + 34} y2={selectedBone.head[1] + 34} stroke="#3b82f6" strokeWidth="4" />
          </g>
        )}
      </g>
      {selectedBone && (
        <circle
          cx={selectedBone.head[0]}
          cy={selectedBone.head[1]}
          r="24"
          fill="transparent"
          aria-label={`${control.tool} ${control.axis.toUpperCase()} ${selectedBone.name}`}
          onPointerDown={event => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
            onTransformStart?.(pointerPoint(event as unknown as React.PointerEvent<SVGSVGElement>));
          }}
        />
      )}
    </svg>
  );
};

import React from 'react';
import { AnimationStudioView } from './AnimationStudioView';

/**
 * 3D Animation workspace entry point.
 *
 * The native WebGL viewport is intentionally no longer mounted as an overlay
 * here. Animation3DViewportBridge is now controlled and must be mounted by the
 * authoritative AnimationStudioView document/editor owner so there is only one
 * project and editor-state source of truth.
 */
export const AnimationStudio3DView: React.FC = () => (
  <div className="relative h-full w-full overflow-hidden">
    <AnimationStudioView />
  </div>
);

export default AnimationStudio3DView;

import React from 'react';
import { AnimationStudioView } from './AnimationStudioView';
import { Animation3DViewport } from './Animation3DViewport';

/**
 * Integration shell for the native WebGL viewport.
 *
 * The existing AnimationStudioView remains the authoritative editor for
 * outliner, properties, pose controls and timeline. This layer replaces the
 * legacy flat center canvas with the Three.js viewport without rewriting the
 * mature editor surface in one risky change.
 */
export const AnimationStudio3DView: React.FC = () => (
  <div className="relative h-full w-full overflow-hidden">
    <AnimationStudioView />
    <section
      className="pointer-events-auto absolute bottom-72 left-56 right-64 top-[108px] z-[5] overflow-hidden border-y border-black bg-[#0d1117]"
      aria-label="Native 3D animation viewport"
    >
      <Animation3DViewport />
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/65 px-2 py-1 font-mono text-[10px] text-gray-300 backdrop-blur-sm">
        PERSPECTIVE · WEBGL 3D VIEWPORT
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/55 px-2 py-1 font-mono text-[10px] text-gray-400">
        Drag: Orbit · Wheel: Zoom · XYZ world grid
      </div>
    </section>
  </div>
);

export default AnimationStudio3DView;

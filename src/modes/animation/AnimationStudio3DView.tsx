import React from 'react';
import { AnimationStudioView } from './AnimationStudioView';
import { Animation3DViewportBridge } from './Animation3DViewportBridge';

/**
 * Native 3D Animation workspace shell. The existing editor remains the
 * authoritative authoring surface while the WebGL viewport reads the same
 * persisted animation document and evaluates rig/bone state at current time.
 */
export const AnimationStudio3DView: React.FC = () => (
  <div className="relative h-full w-full overflow-hidden">
    <AnimationStudioView />
    <section
      className="pointer-events-auto absolute bottom-72 left-56 right-64 top-[108px] z-[5] overflow-hidden border-y border-black bg-[#0d1117]"
      aria-label="Native 3D animation viewport"
    >
      <Animation3DViewportBridge />
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/65 px-2 py-1 font-mono text-[10px] text-gray-300 backdrop-blur-sm">
        PERSPECTIVE · EVALUATED RIG · WEBGL
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/55 px-2 py-1 font-mono text-[10px] text-gray-400">
        Tap joint: Select · Drag empty space: Orbit · Wheel: Zoom
      </div>
    </section>
  </div>
);

export default AnimationStudio3DView;

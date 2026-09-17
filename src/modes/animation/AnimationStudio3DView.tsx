import React, { useState } from 'react';
import { AnimationStudioView } from './AnimationStudioView';
import { Animation3DViewport } from './Animation3DViewport';

/**
 * Native 3D integration shell.
 * The mature editor remains authoritative for document/timeline operations while
 * the WebGL surface owns camera navigation, native rig picking and gizmo preview.
 * The next bridge commits these native transform transactions into MioAnimationProject.
 */
export const AnimationStudio3DView: React.FC = () => {
  const [nativeBone, setNativeBone] = useState<string | null>(null);
  return (
    <div className="relative h-full w-full overflow-hidden">
      <AnimationStudioView />
      <section
        className="pointer-events-auto absolute bottom-72 left-56 right-64 top-[108px] z-[5] overflow-hidden border-y border-black bg-[#0d1117]"
        aria-label="Native 3D animation viewport"
      >
        <Animation3DViewport onBoneSelected={setNativeBone} />
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/65 px-2 py-1 font-mono text-[10px] text-gray-300 backdrop-blur-sm">
          PERSPECTIVE · WEBGL 3D · <span className="text-orange-200">POSE RIG</span>
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-cyan-200">
          {nativeBone ? `BONE · ${nativeBone}` : 'SELECT A BONE'}
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/55 px-2 py-1 font-mono text-[10px] text-gray-400">
          Empty drag: Orbit · Wheel: Zoom · Bone: Select · XYZ gizmo: Move
        </div>
      </section>
    </div>
  );
};

export default AnimationStudio3DView;

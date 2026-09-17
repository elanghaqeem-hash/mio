import React from 'react';
import { AnimationNativeWorkspace } from './AnimationNativeWorkspace';

/**
 * 3D Animation Studio entry point.
 * The native workspace owns exactly one creative document and one document-scoped
 * AnimationEditorState provider. Legacy DOM viewport ownership is no longer part
 * of the production entry path.
 */
export const AnimationStudio3DView: React.FC = () => (
  <div className="relative h-full w-full overflow-hidden">
    <AnimationNativeWorkspace />
  </div>
);

export default AnimationStudio3DView;

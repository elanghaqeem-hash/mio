// 3D Scene Specification (.mio3d)
export interface Mio3DObject {
  id: string;
  name: string;
  type: 'cube' | 'sphere' | 'cylinder' | 'torus' | 'plane' | 'mech_core' | 'drone_hull' | 'custom';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  metalness: number;
  roughness: number;
  wireframe: boolean;
  visible?: boolean;
  proceduralParams?: Record<string, number | string>;
}

export interface Mio3DScene {
  objects: Mio3DObject[];
  camera: {
    position: [number, number, number];
    fov: number;
  };
  lights: {
    ambientColor: string;
    ambientIntensity: number;
    directionalColor: string;
    directionalIntensity: number;
  };
}

// Animation Specification (.mioanim)
export interface Keyframe {
  time: number; // in seconds
  value: any;
  interpolation: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step';
}

export interface AnimationTrack {
  id: string;
  targetObjectId: string;
  property: 'position.x' | 'position.y' | 'position.z' | 'rotation.x' | 'rotation.y' | 'rotation.z' | 'scale';
  keyframes: Keyframe[];
}

export interface MioAnimationProject {
  duration: number; // in seconds
  fps: number;
  tracks: AnimationTrack[];
  currentTime: number;
  loop: boolean;
}

// Graphic Document Specification (.mioart)
export interface GraphicLayer {
  id: string;
  name: string;
  type: 'vector' | 'shape' | 'text' | 'raster';
  visible: boolean;
  locked: boolean;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  shapeType?: 'rectangle' | 'circle' | 'polygon' | 'line' | 'star';
  rotation?: number;
}

export interface MioGraphicDocument {
  width: number;
  height: number;
  backgroundColor: string;
  layers: GraphicLayer[];
  selectedLayerId?: string;
}

// Drawing Document Specification (.miodraw)
export interface DrawingPoint { x: number; y: number; pressure: number }

export interface DrawingStroke {
  id: string;
  points: DrawingPoint[];
  color: string;
  size: number;
  opacity: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'erase';
}

export interface DrawingLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  strokes: DrawingStroke[];
}

export interface MioDrawingDocument {
  width: number;
  height: number;
  backgroundColor: string;
  layers: DrawingLayer[];
}

// SFX Patch Specification (.miosfx)
export interface SFXLayer {
  id: string;
  name: string;
  type: 'transient' | 'oscillator' | 'noise' | 'sub_harmonic';
  waveType: OscillatorType;
  baseFrequency: number;
  frequencySweep: number; // target freq
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterCutoff: number;
  filterResonance: number;
  distortion: number;
  delayTime: number;
  delayFeedback: number;
  reverbMix: number;
  volume: number;
}

export interface MioSFXPatch {
  name: string;
  category: 'UI' | 'MECHANICAL' | 'LASER' | 'ENERGY' | 'IMPACT' | 'AMBIENCE';
  duration: number;
  layers: SFXLayer[];
}

// Music Studio Specification (.miomusic)
export interface NoteEvent {
  id: string;
  pitch: number; // MIDI number 0-127 (e.g. 60 = Middle C)
  startStep: number; // in 16th steps (0 to 63 for a 4-bar loop)
  durationSteps: number; // length in 16th steps
  velocity: number; // 0 to 1
}

export interface MusicTrack {
  id: string;
  name: string;
  role: 'Melody' | 'Harmony' | 'Bass' | 'Rhythm';
  instrument: 'synth_lead' | 'synth_pad' | 'sub_bass' | 'cyber_drums' | 'fm_bells';
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  notes: NoteEvent[];
}

export interface MioMusicProject {
  tempo: number; // BPM
  key: string; // e.g. 'C', 'F#', 'A'
  scale: 'Major' | 'Natural Minor' | 'Dorian' | 'Cyberpunk Aeolian';
  totalSteps: number; // e.g. 64 steps
  tracks: MusicTrack[];
}

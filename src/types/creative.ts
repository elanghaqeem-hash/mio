// 3D Scene Specification (.mio3d)
export interface Mio3DObject { id:string; name:string; type:'cube'|'sphere'|'cylinder'|'torus'|'plane'|'mech_core'|'drone_hull'|'custom'; position:[number,number,number]; rotation:[number,number,number]; scale:[number,number,number]; color:string; metalness:number; roughness:number; wireframe:boolean; visible?:boolean; proceduralParams?:Record<string,number|string>; }
export interface Mio3DScene { objects:Mio3DObject[]; camera:{position:[number,number,number];fov:number}; lights:{ambientColor:string;ambientIntensity:number;directionalColor:string;directionalIntensity:number}; }

// 3D Animation Specification (.mioanim)
export type AnimationInterpolation = 'linear'|'easeIn'|'easeOut'|'easeInOut'|'step'|'bezier';
export type AnimationHandleType = 'AUTO'|'VECTOR'|'ALIGNED'|'FREE';
export interface Keyframe { id?:string; time:number; value:any; interpolation:AnimationInterpolation; handleType?:AnimationHandleType; handleLeft?:[number,number]; handleRight?:[number,number]; }
export interface AnimationTrack { id:string; targetObjectId:string; property:'position.x'|'position.y'|'position.z'|'rotation.x'|'rotation.y'|'rotation.z'|'scale'; keyframes:Keyframe[]; }
export interface BonePose { position:[number,number,number]; rotation:[number,number,number]; scale:[number,number,number]; }
export interface AnimationBone { id:string; name:string; parentId?:string; length:number; connected:boolean; ikFk:'IK'|'FK'; pose:BonePose; }
export interface AnimationRig { id:string; name:string; objectId:string; bones:AnimationBone[]; }
export interface AnimationConstraint { id:string; name:string; type:'IK'|'COPY_TRANSFORM'|'LIMIT_ROTATION'|'TRACK_TO'; targetId?:string; poleTargetId?:string; boneId?:string; influence:number; enabled:boolean; chainLength?:number; poleAngle?:number; minRotation?:[number,number,number]; maxRotation?:[number,number,number]; }
export interface AnimationCameraShot { id:string; name:string; cameraObjectId:string; start:number; end:number; }
export interface AnimationAction { id:string; name:string; trackIds:string[]; start:number; end:number; }
export interface AnimationNLAStrip { id:string; actionId:string; start:number; end:number; actionStart:number; actionEnd:number; scale:number; repeat:number; blend:'REPLACE'|'ADD'|'SUBTRACT'|'MULTIPLY'; influence:number; muted:boolean; }
export interface MioAnimationProject { duration:number; fps:number; tracks:AnimationTrack[]; currentTime:number; loop:boolean; rigs?:AnimationRig[]; constraints?:AnimationConstraint[]; shots?:AnimationCameraShot[]; actions?:AnimationAction[]; nlaStrips?:AnimationNLAStrip[]; playbackRange?:[number,number]; timeScale?:number; }

// Graphic Document Specification (.mioart)
export interface GraphicLayer { id:string; name:string; type:'vector'|'shape'|'text'|'raster'; visible:boolean; locked:boolean; opacity:number; x:number; y:number; width:number; height:number; fill?:string; stroke?:string; strokeWidth?:number; text?:string; fontSize?:number; fontFamily?:string; fontWeight?:number|string; fontStyle?:'normal'|'italic'; textAlign?:'left'|'center'|'right'; lineHeight?:number; shapeType?:'rectangle'|'circle'|'polygon'|'line'|'star'; rotation?:number; }
export interface MioGraphicDocument { width:number; height:number; backgroundColor:string; layers:GraphicLayer[]; selectedLayerId?:string; }
export interface DrawingPoint { x:number; y:number; pressure:number }
export interface DrawingStroke { id:string; points:DrawingPoint[]; color:string; size:number; opacity:number; blendMode:'normal'|'multiply'|'screen'|'erase'; }
export interface DrawingLayer { id:string; name:string; visible:boolean; locked:boolean; opacity:number; strokes:DrawingStroke[]; }
export interface MioDrawingDocument { width:number; height:number; backgroundColor:string; layers:DrawingLayer[]; }
export interface PhotoAdjustments { exposure:number; contrast:number; saturation:number; temperature:number; tint:number; grayscale:number; sepia:number; blur:number; vignette:number; }
export interface PhotoLayer { id:string; name:string; visible:boolean; locked:boolean; opacity:number; sourceDataUrl?:string; adjustments:PhotoAdjustments; }
export interface MioPhotoDocument { width:number; height:number; backgroundColor:string; layers:PhotoLayer[]; }
export type MotionProperty='x'|'y'|'scale'|'rotation'|'opacity';
export interface MotionKeyframe { id:string;time:number;value:number;interpolation:AnimationInterpolation }
export interface MotionTrack { id:string;nodeId:string;property:MotionProperty;keyframes:MotionKeyframe[] }
export interface MotionLayer { id:string;name:string;type:'shape'|'text';visible:boolean;locked:boolean;x:number;y:number;width:number;height:number;scale:number;rotation:number;opacity:number;fill:string;text?:string;fontSize?:number;fontFamily?:string;fontWeight?:number|string;fontStyle?:'normal'|'italic';textAlign?:'left'|'center'|'right';lineHeight?:number;borderRadius?:number; }
export interface MioMotionProject { width:number;height:number;backgroundColor:string;duration:number;fps:number;currentTime:number;loop:boolean;layers:MotionLayer[];tracks:MotionTrack[]; }
export interface SFXLayer { id:string;name:string;type:'transient'|'oscillator'|'noise'|'sub_harmonic';waveType:OscillatorType;baseFrequency:number;frequencySweep:number;attack:number;decay:number;sustain:number;release:number;filterCutoff:number;filterResonance:number;distortion:number;delayTime:number;delayFeedback:number;reverbMix:number;volume:number; }
export interface SFXAutomationPoint { id?:string; time:number; value:number; }
export type SFXAutomatableParameter = 'baseFrequency'|'frequencySweep'|'filterCutoff'|'filterResonance'|'distortion'|'delayTime'|'delayFeedback'|'reverbMix'|'volume';
export type SFXAutomationInterpolation = 'linear'|'step'|'smooth';
export interface SFXAutomationLane { layerId:string; parameter:SFXAutomatableParameter; interpolation?:SFXAutomationInterpolation; points:SFXAutomationPoint[]; }
export interface SFXSampleAssetState { id:string;name:string;sampleRate:number;channels:number;lengthSamples:number;sourceUri?:string;contentHash?:string;version?:number; }
export interface SFXSampleRegionState { id:string;assetId:string;name:string;sourceStart:number;sourceEnd:number;timelineStart:number;gain:number;pan:number;fadeIn:number;fadeOut:number;reverse:boolean;playbackRate:number;pitchSemitones:number;loop:boolean;loopStart?:number;loopEnd?:number; }
export interface MioSFXPatch { name:string;category:'UI'|'MECHANICAL'|'LASER'|'ENERGY'|'IMPACT'|'AMBIENCE';duration:number;layers:SFXLayer[];automationLanes?:SFXAutomationLane[];sampleAssets?:SFXSampleAssetState[];sampleRegions?:SFXSampleRegionState[]; }
export interface NoteEvent { id:string;pitch:number;startStep:number;durationSteps:number;velocity:number; }
export interface MusicInsertEffect { id:string;type:'gain'|'lowpass'|'delay';enabled:boolean;amount:number; }
export interface MusicTrack { id:string;name:string;role:'Melody'|'Harmony'|'Bass'|'Rhythm';instrument:'synth_lead'|'synth_pad'|'sub_bass'|'cyber_drums'|'fm_bells';volume:number;pan:number;mute:boolean;solo:boolean;notes:NoteEvent[];effects?:MusicInsertEffect[]; }
export interface MusicClip { id:string;trackId:string;name:string;startStep:number;lengthSteps:number;sourceStartStep:number;loop:boolean; }
export interface MusicArrangement { totalSteps:number;clips:MusicClip[]; }
export interface MioMusicProject { tempo:number;key:string;scale:'Major'|'Natural Minor'|'Dorian'|'Cyberpunk Aeolian';totalSteps:number;tracks:MusicTrack[];arrangement?:MusicArrangement; }

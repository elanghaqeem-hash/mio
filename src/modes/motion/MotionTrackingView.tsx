import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ShieldCheck, Activity, AlertTriangle, ScanLine, Loader2, Send } from 'lucide-react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { PermissionEngine } from '../../security/PermissionEngine';
import { eventBus } from '../../core/EventBus';
import { poseTransferStore } from '../../core/PoseTransferStore';

interface PosePoint {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const BONES: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

function poseConfidence(points: PosePoint[]): number {
  const core = [11, 12, 23, 24, 25, 26]
    .map((index) => points[index]?.visibility)
    .filter((value): value is number => typeof value === 'number');
  if (!core.length) return points.length === 33 ? 1 : 0;
  return core.reduce((sum, value) => sum + value, 0) / core.length;
}

function deriveGesture(points: PosePoint[], confidence: number): string {
  if (confidence < 0.45 || points.length < 25) return 'LOW_CONFIDENCE';
  const leftWrist = points[15];
  const rightWrist = points[16];
  const leftShoulder = points[11];
  const rightShoulder = points[12];
  if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) return 'POSE_TRACKED';
  const leftRaised = leftWrist.y < leftShoulder.y;
  const rightRaised = rightWrist.y < rightShoulder.y;
  if (leftRaised && rightRaised) return 'BOTH_ARMS_RAISED';
  if (leftRaised) return 'LEFT_ARM_RAISED';
  if (rightRaised) return 'RIGHT_ARM_RAISED';
  return 'POSE_TRACKED';
}

export const MotionTrackingView: React.FC = () => {
  const [cameraActive, setCameraActive] = useState(false);
  const [engineState, setEngineState] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('IDLE');
  const [error, setError] = useState('');
  const [landmarks, setLandmarks] = useState<PosePoint[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [gesture, setGesture] = useState('INACTIVE');
  const [fps, setFps] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const frameCounterRef = useRef({ frames: 0, started: performance.now() });

  const clearOverlay = () => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const stopCamera = () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setLandmarks([]);
    setConfidence(0);
    setGesture('INACTIVE');
    setFps(0);
    clearOverlay();
  };

  useEffect(() => () => {
    stopCamera();
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
  }, []);

  const initializeLandmarker = async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    setEngineState('LOADING');
    const wasmRoot = new URL('mediapipe/wasm/', document.baseURI).href;
    try {
      const vision = await FilesetResolver.forVisionTasks(wasmRoot);
      let landmarker: PoseLandmarker;
      try {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      }
      landmarkerRef.current = landmarker;
      setEngineState('READY');
      eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: 'MediaPipe Pose Landmarker initialized locally', mode: 'MOTION' });
      return landmarker;
    } catch (err) {
      setEngineState('ERROR');
      throw err;
    }
  };

  const drawPose = (points: PosePoint[]) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = Math.max(2, canvas.width / 480);
    for (const [a, b] of BONES) {
      const p1 = points[a]; const p2 = points[b];
      if (!p1 || !p2 || (p1.visibility ?? 1) < 0.35 || (p2.visibility ?? 1) < 0.35) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
      ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
      ctx.stroke();
    }
    for (const point of points) {
      if ((point.visibility ?? 1) < 0.35) continue;
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, Math.max(3, canvas.width / 260), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#00f0ff';
      ctx.stroke();
    }
  };

  const trackingLoop = () => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || !streamRef.current) return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      try {
        const result = landmarker.detectForVideo(video, performance.now());
        const points = (result.landmarks?.[0] || []) as PosePoint[];
        const score = poseConfidence(points);
        setLandmarks(points);
        setConfidence(score);
        setGesture(points.length ? deriveGesture(points, score) : 'NO_POSE');
        drawPose(points);
        frameCounterRef.current.frames += 1;
        const elapsed = performance.now() - frameCounterRef.current.started;
        if (elapsed >= 1000) {
          setFps(Math.round((frameCounterRef.current.frames * 1000) / elapsed));
          frameCounterRef.current = { frames: 0, started: performance.now() };
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pose inference failed');
      }
    }
    animationRef.current = requestAnimationFrame(trackingLoop);
  };

  const toggleCamera = async () => {
    if (cameraActive) {
      stopCamera();
      eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: 'Camera and pose inference terminated', mode: 'MOTION' });
      return;
    }
    setError('');
    const approved = await PermissionEngine.requestPermission({
      action: 'ACTIVATE_LOCAL_POSE_TRACKING',
      target: 'Local camera + MediaPipe Pose Landmarker',
      level: 'L4_EXECUTE',
      changes: ['Request one local camera stream', 'Run 33-landmark pose inference locally on video frames'],
      risks: ['Accesses the camera until deactivated or this workspace is closed', 'Downloads the pinned pose model from Google MediaPipe model storage on first use'],
      expectedResult: 'Real local skeletal landmark extraction. Camera frames are not sent to the MIO Cloudflare API.',
    });
    if (!approved) return;

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API is unavailable. HTTPS or localhost is required.');
      await initializeLandmarker();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error('Video element is unavailable');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);
      frameCounterRef.current = { frames: 0, started: performance.now() };
      eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: 'Local camera + MediaPipe pose inference activated', mode: 'MOTION' });
      animationRef.current = requestAnimationFrame(trackingLoop);
    } catch (err) {
      stopCamera();
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const transferPose = () => {
    if (landmarks.length !== 33) return;
    const capture = { timestamp: Date.now(), landmarks: landmarks.map((point) => ({ ...point })), confidence, gesture };
    poseTransferStore.set(capture);
    eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Queued real MediaPipe pose for Animation (${landmarks.length} landmarks, ${Math.round(confidence * 100)}% confidence)`, mode: 'MOTION' });
    eventBus.emit('SWITCH_MODE', 'ANIMATION');
  };

  return <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden p-4">
    <div className="flex items-center justify-between mb-4 bg-[#0d121d] p-3 rounded-xl border border-gray-800">
      <div className="flex items-center gap-2 text-cyan-300">
        <Activity size={16}/><span className="font-bold text-sm">MOTION // MEDIAPIPE LOCAL POSE LANDMARKER</span>
        <span className="flex gap-1 text-emerald-400 text-[10px] ml-2"><ShieldCheck size={12}/>LOCAL INFERENCE // NO CAMERA UPLOAD</span>
      </div>
      <button onClick={() => void toggleCamera()} className={`px-4 py-1.5 rounded-lg font-bold flex items-center gap-2 ${cameraActive?'bg-red-500 text-white':'bg-cyan-500 text-black'}`}>
        {engineState === 'LOADING' ? <Loader2 size={14} className="animate-spin"/> : cameraActive ? <CameraOff size={14}/> : <Camera size={14}/>} {engineState === 'LOADING' ? 'LOADING ENGINE' : cameraActive ? 'DEACTIVATE CAMERA' : 'REQUEST CAMERA'}
      </button>
    </div>
    {error && <div className="mb-3 p-3 border border-red-500/30 bg-red-950/20 rounded text-red-300 flex gap-2"><AlertTriangle size={14}/><span>Motion error: {error}</span></div>}
    <div className="flex-1 flex gap-4 overflow-hidden">
      <div className="flex-1 bg-black rounded-xl border border-cyan-500/30 overflow-hidden relative flex items-center justify-center">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-contain"/>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none"/>
        {!cameraActive && <div className="absolute text-gray-500 flex flex-col items-center gap-2"><ScanLine size={28}/><span>CAMERA OFF // HTTPS PERMISSION REQUIRED</span></div>}
      </div>
      <div className="w-80 bg-[#0d121d] rounded-xl border border-gray-800 p-4 space-y-4">
        <span className="text-gray-300 font-bold block border-b border-gray-800 pb-2">REAL-TIME POSE TELEMETRY</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#111726] p-3 rounded border border-gray-800"><span className="text-gray-500 text-[10px] block">ENGINE</span><span className={engineState === 'READY' ? 'text-emerald-400' : engineState === 'ERROR' ? 'text-red-400' : 'text-amber-300'}>{engineState}</span></div>
          <div className="bg-[#111726] p-3 rounded border border-gray-800"><span className="text-gray-500 text-[10px] block">INFERENCE FPS</span><span className="text-cyan-300">{cameraActive ? fps : 0}</span></div>
          <div className="bg-[#111726] p-3 rounded border border-gray-800"><span className="text-gray-500 text-[10px] block">LANDMARKS</span><span className="text-cyan-300">{landmarks.length}/33</span></div>
          <div className="bg-[#111726] p-3 rounded border border-gray-800"><span className="text-gray-500 text-[10px] block">CONFIDENCE</span><span className="text-cyan-300">{landmarks.length ? `${Math.round(confidence * 100)}%` : '—'}</span></div>
        </div>
        <div className="bg-[#111726] p-3 rounded border border-gray-800"><span className="text-gray-500 text-[10px] block">DERIVED GESTURE</span><span className="text-emerald-300 font-bold">{gesture}</span><p className="text-gray-500 mt-1 text-[9px]">Gesture label is a deterministic heuristic derived from measured landmarks; it is not a fabricated AI classification.</p></div>
        <div className="bg-emerald-950/20 p-3 rounded border border-emerald-500/30"><span className="text-emerald-300 font-bold">MediaPipe Pose Landmarker</span><p className="text-emerald-200/70 mt-2 text-[10px]">WASM runtime is served from the MIO build. Pose model is fetched from the official Google MediaPipe model store. Frames stay in the local browser/Electron renderer.</p></div>
        <button disabled={landmarks.length !== 33} onClick={transferPose} className="w-full py-2 border border-cyan-500/40 bg-cyan-950/30 disabled:opacity-40 text-cyan-300 rounded font-bold flex items-center justify-center gap-2"><Send size={13}/>TRANSFER CURRENT POSE TO ANIMATION</button>
      </div>
    </div>
  </div>;
};

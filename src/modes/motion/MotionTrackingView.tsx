import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ShieldCheck, Activity, AlertTriangle } from 'lucide-react';
import { PermissionEngine } from '../../security/PermissionEngine';
import { eventBus } from '../../core/EventBus';

export const MotionTrackingView: React.FC = () => {
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  useEffect(() => () => stopCamera(), []);

  const toggleCamera = async () => {
    if (cameraActive) { stopCamera(); eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: 'Camera feed terminated', mode: 'MOTION' }); return; }
    setError('');
    const approved = await PermissionEngine.requestPermission({ action: 'ACTIVATE_CAMERA_PREVIEW', target: 'Local video input', level: 'L4_EXECUTE', changes: ['Request one local camera stream'], risks: ['Accesses the camera until deactivated or this workspace is closed'], expectedResult: 'Display live local preview; no pose claims are made without a landmark engine' });
    if (!approved) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraActive(true);
      eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: 'Local camera preview activated', mode: 'MOTION' });
    } catch (err: any) { stopCamera(); setError(err?.message || String(err)); }
  };

  return <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden p-4">
    <div className="flex items-center justify-between mb-4 bg-[#0d121d] p-3 rounded-xl border border-gray-800"><div className="flex items-center gap-2 text-cyan-300"><Activity size={16}/><span className="font-bold text-sm">MOTION INPUT // LOCAL CAMERA</span><span className="flex gap-1 text-emerald-400 text-[10px] ml-2"><ShieldCheck size={12}/>NO APP-LEVEL UPLOAD</span></div><button onClick={toggleCamera} className={`px-4 py-1.5 rounded-lg font-bold flex gap-2 ${cameraActive?'bg-red-500 text-white':'bg-cyan-500 text-black'}`}>{cameraActive?<CameraOff size={14}/>:<Camera size={14}/>} {cameraActive?'DEACTIVATE CAMERA':'REQUEST CAMERA'}</button></div>
    {error && <div className="mb-3 p-3 border border-red-500/30 bg-red-950/20 rounded text-red-300">Camera error: {error}</div>}
    <div className="flex-1 flex gap-4 overflow-hidden"><div className="flex-1 bg-black rounded-xl border border-cyan-500/30 overflow-hidden relative flex items-center justify-center"><video ref={videoRef} playsInline muted className="max-w-full max-h-full"/>{!cameraActive&&<div className="absolute text-gray-500">CAMERA OFF</div>}</div>
      <div className="w-80 bg-[#0d121d] rounded-xl border border-gray-800 p-4 space-y-4"><span className="text-gray-300 font-bold block border-b border-gray-800 pb-2">CAPABILITY STATUS</span><div className="bg-[#111726] p-3 rounded border border-gray-800"><span className="text-gray-500 text-[10px] block">CAMERA STREAM</span><span className={cameraActive?'text-emerald-400':'text-gray-400'}>{cameraActive?'LIVE':'INACTIVE'}</span></div><div className="bg-amber-950/20 p-3 rounded border border-amber-500/30"><span className="text-amber-300 flex gap-2 font-bold"><AlertTriangle size={13}/>POSE / LANDMARK ENGINE</span><p className="text-amber-200/70 mt-2 text-[10px]">NOT INSTALLED. MIO will not fabricate gestures, confidence scores, or skeletal keypoints. Install and integrate a vetted local landmark engine before pose-to-animation is enabled.</p></div><button disabled className="w-full py-2 border border-gray-700 text-gray-500 rounded opacity-60">TRANSFER POSE TO ANIMATION — UNAVAILABLE</button></div>
    </div>
  </div>;
};

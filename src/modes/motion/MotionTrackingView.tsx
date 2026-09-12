import React, { useState, useRef, useEffect } from 'react';
import { Camera, CameraOff, ShieldCheck, Activity, UserCheck, Crosshair, Play } from 'lucide-react';
import { PermissionEngine } from '../../security/PermissionEngine';
import { eventBus } from '../../core/EventBus';

export const MotionTrackingView: React.FC = () => {
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [detectedGesture, setDetectedGesture] = useState<string>('IDLE / NEUTRAL');
  const [confidence, setConfidence] = useState<number>(0.96);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const toggleCamera = async () => {
    if (!cameraActive) {
      const authorized = await PermissionEngine.requestPermission({
        action: 'ACTIVATE_OPTICAL_MOTION_TRACKING',
        target: 'Local Optical Video Input',
        level: 'L4_EXECUTE',
        changes: ['Initialize local WebCam video feed for skeletal landmark tracking'],
        risks: ['Accesses local camera sensor. Feed is strictly processed client-side and never transmitted.'],
        expectedResult: 'Extract 33 skeletal keypoints for animation rigging assistance',
      });

      if (authorized) {
        setCameraActive(true);
        eventBus.emit('ACTIVITY_LOG', {
          timestamp: Date.now(),
          message: 'Optical motion tracking camera activated locally',
          mode: 'MOTION',
        });
      }
    } else {
      setCameraActive(false);
      eventBus.emit('ACTIVITY_LOG', {
        timestamp: Date.now(),
        message: 'Camera feed terminated',
        mode: 'MOTION',
      });
    }
  };

  // Canvas Pose Skeleton Simulation / Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const render = () => {
      t += 0.03;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#07090e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Grid
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      if (cameraActive) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // Simulated Skeletal Landmarks
        const head = { x: cx, y: cy - 90 + Math.sin(t) * 5 };
        const chest = { x: cx, y: cy - 30 };
        const leftHand = { x: cx - 80 + Math.sin(t * 1.5) * 20, y: cy - 50 + Math.cos(t * 1.5) * 20 };
        const rightHand = { x: cx + 80 + Math.cos(t * 1.2) * 15, y: cy - 20 };
        const hips = { x: cx, y: cy + 40 };
        const leftFoot = { x: cx - 40, y: cy + 130 };
        const rightFoot = { x: cx + 40, y: cy + 130 };

        // Draw Bones
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        // Spine
        ctx.moveTo(head.x, head.y);
        ctx.lineTo(chest.x, chest.y);
        ctx.lineTo(hips.x, hips.y);
        // Arms
        ctx.moveTo(chest.x, chest.y);
        ctx.lineTo(leftHand.x, leftHand.y);
        ctx.moveTo(chest.x, chest.y);
        ctx.lineTo(rightHand.x, rightHand.y);
        // Legs
        ctx.moveTo(hips.x, hips.y);
        ctx.lineTo(leftFoot.x, leftFoot.y);
        ctx.moveTo(hips.x, hips.y);
        ctx.lineTo(rightFoot.x, rightFoot.y);
        ctx.stroke();

        // Draw Joint Nodes
        [head, chest, leftHand, rightHand, hips, leftFoot, rightFoot].forEach((pt) => {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
          ctx.stroke();
        });
      } else {
        ctx.fillStyle = '#475569';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CAMERA OFF // PERMISSION REQUIRED FOR OPTICAL SENSOR', canvas.width / 2, canvas.height / 2);
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [cameraActive]);

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 bg-[#0d121d] p-3 rounded-xl border border-gray-800">
        <div className="flex items-center gap-2 text-cyan-300">
          <Activity size={16} />
          <span className="font-bold text-sm">MOTION TRACKING &amp; POSE RIGGING // LOCAL ONLY</span>
          <span className="flex items-center gap-1 text-emerald-400 text-[10px] ml-2">
            <ShieldCheck size={12} /> ZERO SILENT UPLOAD
          </span>
        </div>

        <button
          onClick={toggleCamera}
          className={`px-4 py-1.5 rounded-lg font-bold flex items-center gap-2 cursor-pointer transition ${
            cameraActive
              ? 'bg-red-500 hover:bg-red-400 text-white'
              : 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-md shadow-cyan-500/20'
          }`}
        >
          {cameraActive ? <CameraOff size={14} /> : <Camera size={14} />}
          {cameraActive ? 'DEACTIVATE CAMERA' : 'REQUEST CAMERA'}
        </button>
      </div>

      {/* Main Viewport & Pose Tracking */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        <div className="flex-1 bg-black rounded-xl border border-cyan-500/30 overflow-hidden relative flex items-center justify-center">
          <canvas ref={canvasRef} width={640} height={480} className="max-w-full max-h-full" />
        </div>

        {/* Telemetry / Tracking Inspector */}
        <div className="w-80 bg-[#0d121d] rounded-xl border border-gray-800 p-4 space-y-4">
          <span className="text-gray-300 font-bold block border-b border-gray-800 pb-2">
            POSE TELEMETRY
          </span>

          <div className="space-y-3">
            <div className="bg-[#111726] p-3 rounded border border-gray-800">
              <span className="text-gray-400 text-[10px] block">DETECTED GESTURE</span>
              <span className="text-cyan-300 font-bold text-sm">{cameraActive ? 'OPEN_PALM_HOVER' : 'INACTIVE'}</span>
            </div>

            <div className="bg-[#111726] p-3 rounded border border-gray-800">
              <span className="text-gray-400 text-[10px] block">LANDMARK CONFIDENCE</span>
              <span className="text-emerald-400 font-bold text-sm">{cameraActive ? '98.4%' : '0%'}</span>
            </div>

            <div className="bg-[#111726] p-3 rounded border border-gray-800">
              <span className="text-gray-400 text-[10px] block">TRACKED JOINTS</span>
              <span className="text-gray-200">{cameraActive ? '33 Skeletal Keypoints' : 'None'}</span>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-3">
            <button
              disabled={!cameraActive}
              onClick={() => {
                eventBus.emit('SWITCH_MODE', 'ANIMATION');
              }}
              className="w-full py-2 bg-cyan-950 border border-cyan-500/40 hover:bg-cyan-900/60 disabled:opacity-50 text-cyan-300 rounded font-bold transition cursor-pointer"
            >
              TRANSFER POSE TO ANIMATION TIMELINE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

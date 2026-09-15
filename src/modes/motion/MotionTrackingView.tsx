import React, { useState, useRef, useEffect } from 'react';
import { Activity, Play, Square, ShieldAlert } from 'lucide-react';
import { eventBus } from '../../core/EventBus';

export const MotionTrackingView: React.FC = () => {
  const [simulationActive, setSimulationActive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let t = 0;
    const render = () => {
      t += 0.03;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#07090e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }

      if (simulationActive) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const head = { x: cx, y: cy - 90 + Math.sin(t) * 5 };
        const chest = { x: cx, y: cy - 30 };
        const leftHand = { x: cx - 80 + Math.sin(t * 1.5) * 20, y: cy - 50 + Math.cos(t * 1.5) * 20 };
        const rightHand = { x: cx + 80 + Math.cos(t * 1.2) * 15, y: cy - 20 };
        const hips = { x: cx, y: cy + 40 };
        const leftFoot = { x: cx - 40, y: cy + 130 };
        const rightFoot = { x: cx + 40, y: cy + 130 };
        ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.moveTo(head.x, head.y); ctx.lineTo(chest.x, chest.y); ctx.lineTo(hips.x, hips.y);
        ctx.moveTo(chest.x, chest.y); ctx.lineTo(leftHand.x, leftHand.y);
        ctx.moveTo(chest.x, chest.y); ctx.lineTo(rightHand.x, rightHand.y);
        ctx.moveTo(hips.x, hips.y); ctx.lineTo(leftFoot.x, leftFoot.y);
        ctx.moveTo(hips.x, hips.y); ctx.lineTo(rightFoot.x, rightFoot.y); ctx.stroke();
        [head, chest, leftHand, rightHand, hips, leftFoot, rightFoot].forEach((pt) => {
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2); ctx.stroke();
        });
      } else {
        ctx.fillStyle = '#475569'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
        ctx.fillText('SIMULATION OFF // CAMERA TRACKING PROVIDER NOT CONNECTED', canvas.width / 2, canvas.height / 2);
      }
      animId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animId);
  }, [simulationActive]);

  const toggleSimulation = () => {
    setSimulationActive((active) => {
      const next = !active;
      eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Motion skeleton simulation ${next ? 'started' : 'stopped'}; no camera feed accessed`, mode: 'MOTION' });
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden p-4">
      <div className="flex items-center justify-between mb-4 bg-[#0d121d] p-3 rounded-xl border border-gray-800">
        <div>
          <div className="flex items-center gap-2 text-cyan-300"><Activity size={16} /><span className="font-bold text-sm">MOTION // TECHNOLOGY PREVIEW</span></div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-300"><ShieldAlert size={11} /> CAMERA / POSE-DETECTION PROVIDER NOT IMPLEMENTED — DEMO IS SYNTHETIC SKELETON MOTION ONLY</div>
        </div>
        <button onClick={toggleSimulation} className={`px-4 py-1.5 rounded-lg font-bold flex items-center gap-2 cursor-pointer transition ${simulationActive ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-md shadow-cyan-500/20'}`}>
          {simulationActive ? <Square size={14} /> : <Play size={14} />}{simulationActive ? 'STOP SIMULATION' : 'RUN LOCAL SIMULATION'}
        </button>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        <div className="flex-1 bg-black rounded-xl border border-cyan-500/30 overflow-hidden relative flex items-center justify-center"><canvas ref={canvasRef} width={640} height={480} className="max-w-full max-h-full" /></div>
        <div className="w-80 bg-[#0d121d] rounded-xl border border-gray-800 p-4 space-y-4">
          <span className="text-gray-300 font-bold block border-b border-gray-800 pb-2">PREVIEW TELEMETRY</span>
          <div className="space-y-3">
            <div className="bg-[#111726] p-3 rounded border border-gray-800"><span className="text-gray-400 text-[10px] block">SOURCE</span><span className="text-cyan-300 font-bold text-sm">{simulationActive ? 'SYNTHETIC_LOCAL_DEMO' : 'INACTIVE'}</span></div>
            <div className="bg-[#111726] p-3 rounded border border-gray-800"><span className="text-gray-400 text-[10px] block">CAMERA INPUT</span><span className="text-amber-300 font-bold text-sm">NOT ACCESSED</span></div>
            <div className="bg-[#111726] p-3 rounded border border-gray-800"><span className="text-gray-400 text-[10px] block">POSE CONFIDENCE</span><span className="text-gray-400">N/A — no pose model inference</span></div>
          </div>
          <div className="border-t border-gray-800 pt-3"><button disabled={!simulationActive} onClick={() => eventBus.emit('SWITCH_MODE', 'ANIMATION')} className="w-full py-2 bg-cyan-950 border border-cyan-500/40 hover:bg-cyan-900/60 disabled:opacity-50 text-cyan-300 rounded font-bold transition cursor-pointer">OPEN ANIMATION WORKSPACE</button></div>
        </div>
      </div>
    </div>
  );
};

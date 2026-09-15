import React, { useEffect, useRef } from 'react';
import { MioCoreState } from '../types/core';

interface MioCoreVisualizerProps {
  state: MioCoreState;
  size?: number;
  audioLevel?: number;
  onClick?: () => void;
  interactive?: boolean;
  priority?: 'hero' | 'standard' | 'compact';
}

export const MioCoreVisualizer: React.FC<MioCoreVisualizerProps> = ({
  state,
  size = 180,
  audioLevel = 0,
  onClick,
  interactive = true,
  priority = 'standard',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId = 0;
    let t = 0;
    let visible = !document.hidden;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, priority === 'hero' ? 1.75 : 1.4);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const particleCount = reducedMotion ? 12 : priority === 'hero' ? 58 : priority === 'compact' ? 20 : 36;
    const particles: { x: number; y: number; angle: number; dist: number; speed: number; size: number }[] = [];
    for (let i = 0; i < particleCount; i++) {
      const variance = ((i * 37) % 17) / 17;
      particles.push({ x: 0, y: 0, angle: (i / particleCount) * Math.PI * 2, dist: size * (0.12 + variance * 0.16), speed: 0.006 + variance * 0.012, size: 0.8 + variance * 1.4 });
    }

    const render = () => {
      if (!visible) return;
      t += reducedMotion ? 0.004 : 0.018;
      const w = size;
      const h = size;
      const cx = w / 2;
      const cy = h / 2;
      const r = size * 0.32;
      ctx.clearRect(0, 0, size, size);

      let mainColor = '#00f0ff';
      let glowColor = 'rgba(0, 240, 255, 0.4)';
      let pulseSpeed = 1.0;
      if (state === 'WARNING') { mainColor = '#f59e0b'; glowColor = 'rgba(245, 158, 11, 0.45)'; }
      else if (state === 'ERROR') { mainColor = '#ef4444'; glowColor = 'rgba(239, 68, 68, 0.5)'; pulseSpeed = 2.5; }
      else if (state === 'SUCCESS') { mainColor = '#10b981'; glowColor = 'rgba(16, 185, 129, 0.5)'; }
      else if (state === 'SECURITY') { mainColor = '#3b82f6'; glowColor = 'rgba(59, 130, 246, 0.5)'; }
      else if (state === 'EMOTIONAL SUPPORT') { mainColor = '#38bdf8'; glowColor = 'rgba(56, 189, 248, 0.3)'; pulseSpeed = 0.5; }
      else if (state === 'OFFLINE') { mainColor = '#64748b'; glowColor = 'rgba(100, 116, 139, 0.2)'; }
      else if (state === '3D MODE') { mainColor = '#06b6d4'; glowColor = 'rgba(6, 182, 212, 0.4)'; }
      else if (state === 'SFX MODE' || state === 'MUSIC MODE') { mainColor = '#818cf8'; glowColor = 'rgba(129, 140, 248, 0.5)'; }

      const breath = Math.sin(t * pulseSpeed) * 4;
      const audioPulse = audioLevel * 18;
      const currentR = Math.max(10, r + breath + audioPulse);
      const ambientGradient = ctx.createRadialGradient(cx, cy, currentR * 0.2, cx, cy, currentR * 1.6);
      ambientGradient.addColorStop(0, glowColor);
      ambientGradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ambientGradient;
      ctx.beginPath(); ctx.arc(cx, cy, currentR * 1.6, 0, Math.PI * 2); ctx.fill();

      const coreGrad = ctx.createRadialGradient(cx - currentR * 0.2, cy - currentR * 0.2, currentR * 0.05, cx, cy, currentR);
      coreGrad.addColorStop(0, '#ffffff'); coreGrad.addColorStop(0.3, mainColor); coreGrad.addColorStop(0.85, 'rgba(10, 25, 45, 0.95)'); coreGrad.addColorStop(1, mainColor);
      ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = mainColor; ctx.fillStyle = coreGrad; ctx.beginPath(); ctx.arc(cx, cy, currentR, 0, Math.PI * 2); ctx.fill(); ctx.restore();

      if (state === 'THINKING' || state === 'PROCESSING') {
        for (let ring = 1; ring <= 3; ring++) {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * (ring % 2 === 0 ? 1 : -1) * 0.8 * ring); ctx.strokeStyle = mainColor; ctx.lineWidth = 1.5; ctx.setLineDash([12 * ring, 8 * ring]); ctx.beginPath(); ctx.arc(0, 0, currentR + 10 * ring, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
      } else if (state === 'LISTENING' || state === 'SFX MODE' || state === 'MUSIC MODE') {
        const segments = 24; ctx.strokeStyle = mainColor; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const wave = Math.sin(angle * 6 + t * 4) * (6 + audioPulse);
          const dist = currentR + 14 + wave;
          const px = cx + Math.cos(angle) * dist;
          const py = cy + Math.sin(angle) * dist;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      } else if (state === '3D MODE') {
        ctx.save(); ctx.translate(cx, cy); const s = currentR * 0.55; const rotY = t * 1.2; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
        const vertices = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
        const proj = vertices.map(([x, y, z]) => {
          const cos = Math.cos(rotY); const sin = Math.sin(rotY); const nx = x * cos - z * sin;
          return [nx * s * 0.7, y * s * 0.7];
        });
        const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
        ctx.beginPath(); edges.forEach(([start, end]) => { ctx.moveTo(proj[start][0], proj[start][1]); ctx.lineTo(proj[end][0], proj[end][1]); }); ctx.stroke(); ctx.restore();
      } else if (state === 'SECURITY') {
        ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = mainColor; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, currentR + 12, -Math.PI * 0.8, Math.PI * 0.8); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -6, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-2, -6, 4, 14); ctx.restore();
      } else {
        ctx.strokeStyle = mainColor; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, currentR + 8 + Math.sin(t * 1.5) * 2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([4, 16]); ctx.beginPath(); ctx.arc(cx, cy, currentR + 16, -t * 0.5, -t * 0.5 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }

      particles.forEach((p) => { p.angle += reducedMotion ? 0 : p.speed; const px = cx + Math.cos(p.angle) * (currentR + p.dist); const py = cy + Math.sin(p.angle) * (currentR + p.dist); ctx.globalAlpha = 0.35 + (p.size / 2.2) * 0.45; ctx.fillStyle = mainColor; ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill(); });
      ctx.globalAlpha = 1;
      if (!reducedMotion) animationFrameId = requestAnimationFrame(render);
    };

    render();
    const onVisibilityChange = () => {
      visible = !document.hidden;
      if (visible && !reducedMotion) animationFrameId = requestAnimationFrame(render);
      else cancelAnimationFrame(animationFrameId);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelAnimationFrame(animationFrameId);
    };
  }, [state, size, audioLevel, priority]);

  return <div onClick={onClick} className={`relative flex shrink-0 items-center justify-center ${interactive ? 'cursor-pointer' : ''}`} style={{ width: size, height: size }} title={`Mio Core: ${state}`}><canvas ref={canvasRef} role="img" aria-label={`Mio Core status ${state}`} className="transition-transform duration-300 motion-reduce:transition-none hover:scale-[1.02]" /></div>;
};

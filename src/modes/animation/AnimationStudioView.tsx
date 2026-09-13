import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Clock, Plus, Film } from 'lucide-react';
import { MioAnimationProject } from '../../types/creative';
import { eventBus } from '../../core/EventBus';

const runtimeTimestamp = () => Date.now();

export const AnimationStudioView: React.FC = () => {
  const [animProject, setAnimProject] = useState<MioAnimationProject>({
    duration: 5.0,
    fps: 60,
    currentTime: 0,
    loop: true,
    tracks: [
      { id: 'track_locomotion_y', targetObjectId: 'Vanguard_Mech_Hull', property: 'position.y', keyframes: [
        { time: 0, value: 0, interpolation: 'easeInOut' },
        { time: 1.5, value: 0.8, interpolation: 'easeInOut' },
        { time: 3.0, value: -0.2, interpolation: 'easeInOut' },
        { time: 5.0, value: 0, interpolation: 'easeInOut' },
      ] },
      { id: 'track_thruster_rot', targetObjectId: 'Thruster_Pod_L', property: 'rotation.z', keyframes: [
        { time: 0, value: 0, interpolation: 'linear' },
        { time: 2.5, value: 0.45, interpolation: 'easeInOut' },
        { time: 5.0, value: 0, interpolation: 'linear' },
      ] },
    ],
  });
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    let lastTime = performance.now();
    let frameId = 0;
    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      setAnimProject((previous) => {
        let nextTime = previous.currentTime + delta;
        if (nextTime > previous.duration) {
          if (previous.loop) nextTime = 0;
          else {
            nextTime = previous.duration;
            setIsPlaying(false);
          }
        }
        return { ...previous, currentTime: nextTime };
      });
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying]);

  const handleScrub = (time: number) => setAnimProject((previous) => ({ ...previous, currentTime: Math.max(0, Math.min(previous.duration, time)) }));

  const addKeyframeToTrack = (trackId: string) => {
    setAnimProject((previous) => ({
      ...previous,
      tracks: previous.tracks.map((track) => track.id === trackId
        ? { ...track, keyframes: [...track.keyframes, { time: parseFloat(previous.currentTime.toFixed(2)), value: 0.5, interpolation: 'easeInOut' as const }].sort((a, b) => a.time - b.time) }
        : track),
    }));
    eventBus.emit('ACTIVITY_LOG', { timestamp: runtimeTimestamp(), message: `Added keyframe at ${animProject.currentTime.toFixed(2)}s to track ${trackId}`, mode: 'ANIMATION' });
  };

  const hoverVal = Math.sin((animProject.currentTime / animProject.duration) * Math.PI * 2) * 20;

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden">
      <div className="flex-1 relative flex items-center justify-center border-b border-gray-800 bg-[#0a0e17] overflow-hidden">
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-[#0d121d]/90 px-3 py-1.5 rounded border border-cyan-500/30 text-cyan-300"><Film size={14} /><span>ANIMATION WORKSPACE // KINETIC PREVIEW</span><span className="text-amber-300 text-[10px] ml-2">LOCAL STRUCTURAL PREVIEW</span></div>
        <div className="relative flex flex-col items-center justify-center p-8 rounded-2xl bg-cyan-950/20 border border-cyan-500/40 shadow-2xl shadow-cyan-500/10 transition-transform duration-75" style={{ transform: `translateY(${-hoverVal}px)` }}>
          <div className="w-24 h-24 rounded-full border-2 border-cyan-400/80 flex items-center justify-center bg-cyan-500/10 cyan-glow"><div className="w-12 h-12 rounded-full bg-cyan-400 cyan-glow animate-pulse" /></div>
          <div className="mt-4 text-center"><span className="text-cyan-300 font-bold block text-sm">Vanguard_Mech_Hull</span><span className="text-gray-400 text-[10px]">Pos Y: {(hoverVal / 20).toFixed(2)}m | Time: {animProject.currentTime.toFixed(2)}s</span></div>
        </div>
        <div className="absolute bottom-4 flex items-center gap-3 bg-[#0d121d]/90 backdrop-blur border border-gray-700 px-4 py-2 rounded-xl">
          <button onClick={() => handleScrub(0)} className="p-1.5 hover:bg-gray-800 text-gray-300 rounded cursor-pointer" title="Reset"><RotateCcw size={16} /></button>
          <button onClick={() => setIsPlaying((playing) => !playing)} className="p-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg font-bold shadow-md shadow-cyan-500/30 cursor-pointer">{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
          <div className="flex items-center gap-1.5 px-2 text-cyan-300"><Clock size={14} /><span className="text-sm font-bold">{animProject.currentTime.toFixed(2)}s</span><span className="text-gray-500">/ {animProject.duration.toFixed(1)}s</span></div>
          <button onClick={() => setAnimProject((project) => ({ ...project, loop: !project.loop }))} className={`px-2 py-1 rounded text-[10px] border cursor-pointer ${animProject.loop ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'border-gray-700 text-gray-500 hover:bg-gray-800'}`}>LOOP: {animProject.loop ? 'ON' : 'OFF'}</button>
        </div>
      </div>

      <div className="h-64 bg-[#0d121d] flex flex-col border-t border-gray-800">
        <div className="h-8 bg-[#111726] border-b border-gray-800 flex items-center px-4"><span className="w-56 text-gray-400 font-bold text-[11px]">MOTION TRACKS</span><div className="flex-1 relative h-full flex items-center"><input type="range" min="0" max={animProject.duration} step="0.01" value={animProject.currentTime} onChange={(event) => handleScrub(parseFloat(event.target.value))} className="w-full accent-cyan-400 h-1.5 bg-gray-800 rounded cursor-ew-resize" /></div></div>
        <div className="flex-1 overflow-y-auto">{animProject.tracks.map((track) => <div key={track.id} className="flex items-center h-14 border-b border-gray-800/80 hover:bg-gray-800/20 px-4">
          <div className="w-56 pr-2"><span className="text-cyan-300 font-bold block truncate">{track.targetObjectId}</span><span className="text-[10px] text-gray-400 block">{track.property}</span></div>
          <div className="flex-1 relative h-8 bg-[#090d15] rounded border border-gray-800/60 flex items-center px-2">
            {track.keyframes.map((keyframe, index) => <div key={index} style={{ left: `${(keyframe.time / animProject.duration) * 100}%` }} className="absolute -translate-x-1/2 w-3 h-3 rotate-45 bg-cyan-400 border border-white shadow-sm shadow-cyan-400 cursor-pointer hover:scale-125 transition-transform" title={`Time: ${keyframe.time}s | Val: ${keyframe.value}`} />)}
            <div style={{ left: `${(animProject.currentTime / animProject.duration) * 100}%` }} className="absolute top-0 bottom-0 w-0.5 bg-red-500 shadow-md shadow-red-500 z-10 pointer-events-none" />
          </div>
          <button onClick={() => addKeyframeToTrack(track.id)} className="ml-3 p-1.5 bg-gray-800 hover:bg-cyan-950 text-cyan-400 border border-gray-700 hover:border-cyan-500/40 rounded cursor-pointer" title="Add Keyframe at playhead"><Plus size={14} /></button>
        </div>)}</div>
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Clock, Plus, Film, ScanLine } from 'lucide-react';
import { AnimationTrack, MioAnimationProject } from '../../types/creative';
import { eventBus } from '../../core/EventBus';
import { poseTransferStore, PoseTransferCapture } from '../../core/PoseTransferStore';

const LANDMARK_TARGETS: Array<[number, string]> = [
  [11, 'Left_Shoulder'], [12, 'Right_Shoulder'], [15, 'Left_Wrist'], [16, 'Right_Wrist'],
  [23, 'Left_Hip'], [24, 'Right_Hip'], [27, 'Left_Ankle'], [28, 'Right_Ankle'],
];

function upsertKeyframe(track: AnimationTrack | undefined, id: string, target: string, property: 'position.x' | 'position.y', time: number, value: number): AnimationTrack {
  const keyframe = { time, value, interpolation: 'linear' as const };
  if (!track) return { id, targetObjectId: target, property, keyframes: [keyframe] };
  const filtered = track.keyframes.filter((item) => Math.abs(item.time - time) > 0.005);
  return { ...track, keyframes: [...filtered, keyframe].sort((a, b) => a.time - b.time) };
}

export const AnimationStudioView: React.FC = () => {
  const [animProject, setAnimProject] = useState<MioAnimationProject>({ duration: 5, fps: 60, currentTime: 0, loop: true, tracks: [] });
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastCapture, setLastCapture] = useState<PoseTransferCapture | null>(null);
  const playRef = useRef(false);

  useEffect(() => { playRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    const capture = poseTransferStore.take();
    if (!capture || capture.landmarks.length !== 33) return;
    const captureTime = 0;
    setLastCapture(capture);
    setAnimProject((prev) => {
      const tracks = [...prev.tracks];
      for (const [index, target] of LANDMARK_TARGETS) {
        const point = capture.landmarks[index];
        if (!point) continue;
        const coordinates: Array<['position.x' | 'position.y', number]> = [
          ['position.x', (point.x - 0.5) * 2],
          ['position.y', (0.5 - point.y) * 2],
        ];
        for (const [property, value] of coordinates) {
          const id = `pose_${index}_${property.endsWith('x') ? 'x' : 'y'}`;
          const existingIndex = tracks.findIndex((track) => track.id === id);
          const updated = upsertKeyframe(existingIndex >= 0 ? tracks[existingIndex] : undefined, id, target, property, captureTime, Number(value.toFixed(5)));
          if (existingIndex >= 0) tracks[existingIndex] = updated; else tracks.push(updated);
        }
      }
      return { ...prev, currentTime: captureTime, tracks };
    });
    eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Imported MediaPipe pose into ${LANDMARK_TARGETS.length * 2} editable coordinate tracks`, mode: 'ANIMATION' });
  }, []);

  useEffect(() => {
    let lastTime = performance.now();
    let frameId = 0;
    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      if (playRef.current) {
        setAnimProject((prev) => {
          let nextTime = prev.currentTime + delta;
          if (nextTime > prev.duration) {
            nextTime = prev.loop ? 0 : prev.duration;
            if (!prev.loop) setIsPlaying(false);
          }
          return { ...prev, currentTime: nextTime };
        });
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleScrub = (time: number) => setAnimProject((prev) => ({ ...prev, currentTime: Math.max(0, Math.min(prev.duration, time)) }));

  const addKeyframeToTrack = (trackId: string) => {
    setAnimProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => {
        if (track.id !== trackId) return track;
        const lastValue = track.keyframes.length ? track.keyframes[track.keyframes.length - 1].value : 0;
        const time = Number(prev.currentTime.toFixed(2));
        const keyframes = [...track.keyframes.filter((item) => Math.abs(item.time - time) > 0.005), { time, value: lastValue, interpolation: 'linear' as const }].sort((a, b) => a.time - b.time);
        return { ...track, keyframes };
      }),
    }));
    eventBus.emit('ACTIVITY_LOG', { timestamp: Date.now(), message: `Added measured-value keyframe at ${animProject.currentTime.toFixed(2)}s to ${trackId}`, mode: 'ANIMATION' });
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden">
      <div className="flex-1 relative flex items-center justify-center border-b border-gray-800 bg-[#0a0e17] overflow-hidden">
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-[#0d121d]/90 px-3 py-1.5 rounded border border-cyan-500/30 text-cyan-300">
          <Film size={14}/><span>ANIMATION WORKSPACE // DATA-BACKED TIMELINE</span>
          <span className={`text-[10px] ml-2 ${lastCapture ? 'text-emerald-400' : 'text-gray-500'}`}>{lastCapture ? 'MEDIAPIPE CAPTURE LOADED' : 'EMPTY TIMELINE'}</span>
        </div>

        {lastCapture ? (
          <div className="grid grid-cols-2 gap-3 w-[460px]">
            <div className="bg-[#0d121d] p-5 rounded-xl border border-cyan-500/30"><span className="text-gray-500 block text-[10px]">SOURCE LANDMARKS</span><span className="text-cyan-300 text-2xl font-bold">{lastCapture.landmarks.length}</span><span className="text-gray-500 ml-2">MediaPipe points</span></div>
            <div className="bg-[#0d121d] p-5 rounded-xl border border-cyan-500/30"><span className="text-gray-500 block text-[10px]">CAPTURE CONFIDENCE</span><span className="text-cyan-300 text-2xl font-bold">{Math.round(lastCapture.confidence * 100)}%</span></div>
            <div className="col-span-2 bg-[#0d121d] p-4 rounded-xl border border-gray-800"><span className="text-gray-500 block text-[10px]">DERIVED GESTURE</span><span className="text-emerald-300 font-bold">{lastCapture.gesture}</span><div className="text-gray-500 mt-2 text-[10px]">Capture time: {new Date(lastCapture.timestamp).toLocaleString()} · Timeline tracks use measured normalized coordinates.</div></div>
          </div>
        ) : (
          <div className="text-gray-500 flex flex-col items-center gap-3"><ScanLine size={42}/><span>No motion data loaded. Capture a real pose in MOTION and transfer it here.</span></div>
        )}

        <div className="absolute bottom-4 flex items-center gap-3 bg-[#0d121d]/90 backdrop-blur border border-gray-700 px-4 py-2 rounded-xl">
          <button onClick={() => handleScrub(0)} className="p-1.5 hover:bg-gray-800 text-gray-300 rounded" title="Reset"><RotateCcw size={16}/></button>
          <button onClick={() => setIsPlaying(!isPlaying)} disabled={!animProject.tracks.length} className="p-2 bg-cyan-500 disabled:opacity-40 text-black rounded-lg font-bold">{isPlaying ? <Pause size={18}/> : <Play size={18}/>}</button>
          <div className="flex items-center gap-1.5 px-2 text-cyan-300"><Clock size={14}/><span className="text-sm font-bold">{animProject.currentTime.toFixed(2)}s</span><span className="text-gray-500">/ {animProject.duration.toFixed(1)}s</span></div>
          <button onClick={() => setAnimProject((p) => ({ ...p, loop: !p.loop }))} className={`px-2 py-1 rounded text-[10px] border ${animProject.loop ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'border-gray-700 text-gray-500'}`}>LOOP: {animProject.loop ? 'ON' : 'OFF'}</button>
        </div>
      </div>

      <div className="h-72 bg-[#0d121d] flex flex-col border-t border-gray-800">
        <div className="h-9 bg-[#111726] border-b border-gray-800 flex items-center px-4"><span className="w-56 text-gray-400 font-bold text-[11px]">REAL MOTION TRACKS ({animProject.tracks.length})</span><input type="range" min="0" max={animProject.duration} step="0.01" value={animProject.currentTime} onChange={(e) => handleScrub(parseFloat(e.target.value))} className="flex-1 accent-cyan-400 h-1.5 bg-gray-800 rounded"/></div>
        <div className="flex-1 overflow-y-auto">
          {!animProject.tracks.length && <div className="h-full flex items-center justify-center text-gray-600">Timeline has no captured motion data.</div>}
          {animProject.tracks.map((track) => (
            <div key={track.id} className="flex items-center h-14 border-b border-gray-800/80 hover:bg-gray-800/20 px-4">
              <div className="w-56 pr-2"><span className="text-cyan-300 font-bold block truncate">{track.targetObjectId}</span><span className="text-[10px] text-gray-400 block">{track.property}</span></div>
              <div className="flex-1 relative h-8 bg-[#090d15] rounded border border-gray-800/60 flex items-center px-2">
                {track.keyframes.map((kf, i) => <div key={`${kf.time}-${i}`} style={{ left: `${(kf.time / animProject.duration) * 100}%` }} className="absolute -translate-x-1/2 w-3 h-3 rotate-45 bg-cyan-400 border border-white" title={`Time: ${kf.time}s | measured value: ${Number(kf.value).toFixed(4)}`}/>) }
                <div style={{ left: `${(animProject.currentTime / animProject.duration) * 100}%` }} className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"/>
              </div>
              <button onClick={() => addKeyframeToTrack(track.id)} className="ml-3 p-1.5 bg-gray-800 hover:bg-cyan-950 text-cyan-400 border border-gray-700 rounded" title="Add keyframe using latest measured value"><Plus size={14}/></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

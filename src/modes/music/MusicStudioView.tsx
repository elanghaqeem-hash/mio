import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MioMusicProject, NoteEvent, MusicTrack } from '../../types/creative';
import { Download, Play, Square, Music, Plus, ShieldCheck, RotateCcw, Trash2 } from 'lucide-react';
import { eventBus } from '../../core/EventBus';
import { emergencyStop } from '../../core/EmergencyStop';
import { useCreativeStudioDocument } from '../../creative/useCreativeStudioDocument';
import { CreativeWorkspaceToolbar } from '../../components/creative/CreativeWorkspaceToolbar';
import { audibleMusicTracks, musicStepDuration, estimateTrackMeter, quantizeNoteEvent, transposeNotes, moveNote, resizeNote, moveMusicClip, resizeMusicClip, toggleMusicClipLoop, duplicateMusicClip, splitMusicClip, notesForClip, evaluateMusicAutomationLane, mapMusicAutomationValue } from '../../creative/AudioWorkspace';
import { ExportManager } from '../../project/ExportManager';

const INITIAL_MUSIC_PROJECT: MioMusicProject = {
    tempo: 124,
    key: 'A',
    scale: 'Cyberpunk Aeolian',
    totalSteps: 16,
    tracks: [
      { id: 'trk_lead', name: 'Cyberpunk Lead Synth', role: 'Melody', instrument: 'synth_lead', volume: 0.8, pan: 0, mute: false, solo: false, notes: [
        { id: 'n1', pitch: 69, startStep: 0, durationSteps: 2, velocity: 0.9 },
        { id: 'n2', pitch: 72, startStep: 2, durationSteps: 2, velocity: 0.8 },
        { id: 'n3', pitch: 76, startStep: 4, durationSteps: 4, velocity: 0.95 },
        { id: 'n4', pitch: 74, startStep: 8, durationSteps: 4, velocity: 0.85 },
        { id: 'n5', pitch: 71, startStep: 12, durationSteps: 4, velocity: 0.85 },
      ] },
      { id: 'trk_bass', name: 'Sub-Bass Kinetic Driver', role: 'Bass', instrument: 'sub_bass', volume: 0.85, pan: 0, mute: false, solo: false, notes: [
        { id: 'nb1', pitch: 45, startStep: 0, durationSteps: 4, velocity: 0.9 },
        { id: 'nb2', pitch: 45, startStep: 4, durationSteps: 4, velocity: 0.9 },
        { id: 'nb3', pitch: 48, startStep: 8, durationSteps: 4, velocity: 0.9 },
        { id: 'nb4', pitch: 43, startStep: 12, durationSteps: 4, velocity: 0.9 },
      ] },
      { id: 'trk_pad', name: 'Harmonic Atmospheric Pad', role: 'Harmony', instrument: 'synth_pad', volume: 0.6, pan: -0.2, mute: false, solo: false, notes: [
        { id: 'np1', pitch: 57, startStep: 0, durationSteps: 8, velocity: 0.7 },
        { id: 'np2', pitch: 60, startStep: 8, durationSteps: 8, velocity: 0.7 },
      ] },
    ],
};

export const MusicStudioView: React.FC = () => {
  const workspace = useCreativeStudioDocument<MioMusicProject>('MIO_Music_Project.miomusic', INITIAL_MUSIC_PROJECT);
  const { state: project, setState: setProject } = workspace;
  const [activeTrackId, setActiveTrackId] = useState('trk_lead');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [automationParameter,setAutomationParameter]=useState<'volume'|'pan'|'sendLevel'|'effectAmount'|'effectMix'|'effectFeedback'|'effectResonance'>('volume');
  const [automationTargetId,setAutomationTargetId]=useState<string>('');
  const [selectedAutomationPointId,setSelectedAutomationPointId]=useState<string|null>(null);
  const automationEditorRef=useRef<HTMLDivElement|null>(null);
  const automationDragRef=useRef<{id:string;startX:number;startY:number;originStep:number;originValue:number}|null>(null);
  const automationDrawRef=useRef<{pointerId:number}|null>(null);
  const clipDragRef = useRef<{id:string;startX:number;originStart:number}|null>(null);
  const clipResizeRef = useRef<{id:string;startX:number;originLength:number}|null>(null);
  const arrangementTimelineRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentStepRef = useRef(currentStep);
  const [transportEpoch,setTransportEpoch]=useState(0);
  const transportGenerationRef = useRef(0);
  const schedulerRef = useRef<number | null>(null);
  const automationScheduleEpochRef = useRef(0);
  const transportRevisionRef = useRef(0);
  const trackChannelRef=useRef<Map<string,{input:GainNode;volume:GainNode;panner:StereoPannerNode;output:GainNode;sends:Map<string,GainNode>}>>(new Map());
  const returnChannelRef=useRef<Map<string,{input:GainNode;output:GainNode}>>(new Map());
  const liveFxParamRef=useRef<Map<string,{amount?:AudioParam;mix?:AudioParam;feedback?:AudioParam;resonance?:AudioParam}>>(new Map());
  const pianoRollRef = useRef<HTMLDivElement | null>(null);
  const draggingNoteRef = useRef<{id:string;startX:number;startY:number;originStep:number;originPitch:number}|null>(null);
  const resizingNoteRef = useRef<{id:string;startX:number;originDuration:number}|null>(null);
  const activeTrack = project.tracks.find((track) => track.id === activeTrackId);
  const automationNeedsTarget=automationParameter!=='volume'&&automationParameter!=='pan';
  const automationTargets=automationParameter==='sendLevel'?(activeTrack?.sends??[]).map(send=>({id:send.busId,label:project.returnBuses?.find(bus=>bus.id===send.busId)?.name??send.busId})):(activeTrack?.effects??[]).map(effect=>({id:effect.id,label:`${effect.type.toUpperCase()} · ${effect.id.slice(-6)}`}));
  const resolvedAutomationTargetId=automationNeedsTarget?(automationTargets.some(target=>target.id===automationTargetId)?automationTargetId:(automationTargets[0]?.id??'')):undefined;
  const selectedNote = activeTrack?.notes.find((note) => note.id === selectedNoteId);
  const pitchRange = Array.from({ length: 49 }, (_, index) => 84 - index);
  const moveNoteFromPointer = (clientX:number, clientY:number) => {
    const drag=draggingNoteRef.current, rect=pianoRollRef.current?.getBoundingClientRect(); if(!drag||!rect||!activeTrack)return;
    const deltaSteps=Math.round((clientX-drag.startX)/(rect.width/project.totalSteps));
    const rowHeight=rect.height/pitchRange.length; const deltaRows=Math.round((clientY-drag.startY)/rowHeight);
    const originIndex=pitchRange.indexOf(drag.originPitch); const targetPitch=pitchRange[Math.max(0,Math.min(pitchRange.length-1,originIndex+deltaRows))]??drag.originPitch;
    setProject(current=>({...current,tracks:current.tracks.map(track=>track.id===activeTrackId?{...track,notes:track.notes.map(note=>note.id===drag.id?moveNote({...note,startStep:drag.originStep,pitch:drag.originPitch},deltaSteps,targetPitch-drag.originPitch,current.totalSteps):note)}:track)}));
  };

  const resizeNoteFromPointer = (clientX:number) => {
    const drag=resizingNoteRef.current, rect=pianoRollRef.current?.getBoundingClientRect(); if(!drag||!rect||!activeTrack)return;
    const deltaSteps=Math.round((clientX-drag.startX)/(rect.width/project.totalSteps));
    setProject(current=>({...current,tracks:current.tracks.map(track=>track.id===activeTrackId?{...track,notes:track.notes.map(note=>note.id===drag.id?resizeNote(note,drag.originDuration+deltaSteps,current.totalSteps):note)}:track)}));
  };

  const midiNoteNames = Object.fromEntries(Array.from({length:128},(_,pitch)=>{const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];return [pitch,`${names[pitch%12]}${Math.floor(pitch/12)-1}`];})) as Record<number,string>;

  const automationValue = (trackId:string, parameter:string, step:number, targetId?:string) => { const lane=project.automationLanes?.find(candidate=>candidate.trackId===trackId&&candidate.parameter===parameter&&candidate.targetId===targetId); return lane?evaluateMusicAutomationLane(lane,step):undefined; };

  const scheduleLiveAutomation=(track:MusicTrack,step:number,now:number)=>{const channel=trackChannelRef.current.get(track.id);if(!channel)return;const volume=automationValue(track.id,'volume',step);if(volume!==undefined)channel.volume.gain.setValueAtTime(volume,now);const pan=automationValue(track.id,'pan',step);if(pan!==undefined)channel.panner.pan.setValueAtTime(pan*2-1,now);for(const [busId,sendNode] of channel.sends){const value=automationValue(track.id,'sendLevel',step,busId);if(value!==undefined)sendNode.gain.setValueAtTime(value,now);}for(const effect of track.effects??[]){const handles=liveFxParamRef.current.get(effect.id);if(!handles)continue;const amount=automationValue(track.id,'effectAmount',step,effect.id),mix=automationValue(track.id,'effectMix',step,effect.id),feedback=automationValue(track.id,'effectFeedback',step,effect.id),resonance=automationValue(track.id,'effectResonance',step,effect.id);if(amount!==undefined&&handles.amount)handles.amount.setValueAtTime(mapMusicAutomationValue('effectAmount',amount,effect.type),now);if(mix!==undefined&&handles.mix)handles.mix.setValueAtTime(mapMusicAutomationValue('effectMix',mix,effect.type),now);if(feedback!==undefined&&handles.feedback)handles.feedback.setValueAtTime(mapMusicAutomationValue('effectFeedback',feedback,effect.type),now);if(resonance!==undefined&&handles.resonance)handles.resonance.setValueAtTime(mapMusicAutomationValue('effectResonance',resonance,effect.type),now);}};

  const connectTrackEffects = (ctx: BaseAudioContext, input: AudioNode, track: MusicTrack, destination: AudioNode, step:number, exposeParams=false) => { let node=input; for(const effect of track.effects??[]){ if(!effect.enabled)continue; const amount=automationValue(track.id,'effectAmount',step,effect.id)??effect.amount, mix=automationValue(track.id,'effectMix',step,effect.id)??effect.mix??0.35, feedbackValue=automationValue(track.id,'effectFeedback',step,effect.id)??effect.feedback??0.25, resonance=automationValue(track.id,'effectResonance',step,effect.id)??effect.resonance??0; if(effect.type==='gain'){const gain=ctx.createGain();gain.gain.value=0.5+amount;node.connect(gain);node=gain;if(exposeParams)liveFxParamRef.current.set(effect.id,{amount:gain.gain});} else if(effect.type==='lowpass'){const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=200+amount*19800;filter.Q.value=resonance*20;node.connect(filter);node=filter;if(exposeParams)liveFxParamRef.current.set(effect.id,{amount:filter.frequency,resonance:filter.Q});} else if(effect.type==='delay'){const dry=ctx.createGain(),wet=ctx.createGain(),delay=ctx.createDelay(1),feedback=ctx.createGain(),sum=ctx.createGain();dry.gain.value=1-mix;wet.gain.value=mix;delay.delayTime.value=amount*0.5;feedback.gain.value=Math.min(0.9,feedbackValue);node.connect(dry);dry.connect(sum);node.connect(delay);delay.connect(wet);wet.connect(sum);delay.connect(feedback);feedback.connect(delay);node=sum;if(exposeParams)liveFxParamRef.current.set(effect.id,{amount:delay.delayTime,mix:wet.gain,feedback:feedback.gain});} } node.connect(destination); };

  const connectReturnSends = (ctx: BaseAudioContext, input: AudioNode, track: MusicTrack, destination: AudioNode, step:number) => { for(const send of track.sends??[]){ const automatedLevel=automationValue(track.id,'sendLevel',step,send.busId)??send.level; if(!send.enabled||automatedLevel<=0)continue; const bus=project.returnBuses?.find(candidate=>candidate.id===send.busId); if(!bus)continue; const sendGain=ctx.createGain(),returnGain=ctx.createGain(); sendGain.gain.value=automatedLevel; returnGain.gain.value=bus.volume; input.connect(sendGain); connectTrackEffects(ctx,sendGain,{...track,effects:[bus.effect]},returnGain,step); returnGain.connect(destination); } };

  const ensureLiveReturnChannel=(ctx:AudioContext,bus:NonNullable<MioMusicProject['returnBuses']>[number],track:MusicTrack,step:number)=>{const existing=returnChannelRef.current.get(bus.id);if(existing)return existing;const input=ctx.createGain(),output=ctx.createGain();output.gain.value=bus.volume;connectTrackEffects(ctx,input,{...track,effects:[bus.effect]},output,step);output.connect(ctx.destination);returnChannelRef.current.set(bus.id,{input,output});return {input,output};};
  const ensureLiveTrackChannel=(ctx:AudioContext,track:MusicTrack,step:number)=>{const existing=trackChannelRef.current.get(track.id);if(existing)return existing;const input=ctx.createGain(),volume=ctx.createGain(),panner=ctx.createStereoPanner(),output=ctx.createGain(),sends=new Map<string,GainNode>();volume.gain.value=automationValue(track.id,'volume',step)??track.volume;input.connect(volume);volume.connect(panner);connectTrackEffects(ctx,panner,track,output,step,true);output.connect(ctx.destination);for(const send of track.sends??[]){const bus=project.returnBuses?.find(candidate=>candidate.id===send.busId),level=automationValue(track.id,'sendLevel',step,send.busId)??send.level;if(!send.enabled||!bus)continue;const sendGain=ctx.createGain();sendGain.gain.value=Math.max(0,level);panner.connect(sendGain);sendGain.connect(ensureLiveReturnChannel(ctx,bus,track,step).input);sends.set(send.busId,sendGain);}const channel={input,volume,panner,output,sends};trackChannelRef.current.set(track.id,channel);return channel;};
  const clearLiveTrackChannels=()=>{for(const channel of trackChannelRef.current.values()){try{channel.input.disconnect();channel.volume.disconnect();channel.panner.disconnect();channel.output.disconnect();for(const send of channel.sends.values())send.disconnect();}catch{/* already disconnected */}}trackChannelRef.current.clear();for(const channel of returnChannelRef.current.values()){try{channel.input.disconnect();channel.output.disconnect();}catch{/* already disconnected */}}returnChannelRef.current.clear();liveFxParamRef.current.clear();};
  const rescheduleTransport=useCallback((nextStep:number)=>{transportGenerationRef.current+=1;transportRevisionRef.current+=1;setCurrentStep(nextStep);setTransportEpoch(epoch=>epoch+1);clearLiveTrackChannels();},[]);

  useEffect(() => { currentStepRef.current=currentStep; }, [currentStep]);

  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass && !audioCtxRef.current) audioCtxRef.current = new AudioContextClass();
    transportGenerationRef.current += 1;
    transportRevisionRef.current += 1;
    const generation = transportGenerationRef.current;
    if (!isPlaying) { if(schedulerRef.current!==null){window.clearInterval(schedulerRef.current);schedulerRef.current=null;} clearLiveTrackChannels(); return; }

    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const stepDuration = musicStepDuration(project.tempo);
    const lookaheadSec = 0.12;
    const tickMs = 25;
    const runtimeSteps = project.arrangement?.totalSteps ?? project.totalSteps;
    const transportOrigin = ctx.currentTime - (currentStepRef.current * stepDuration);
    const revision = transportRevisionRef.current;
    const scheduled = new Set<string>();
    const ownedNodes = new Set<AudioNode>();

    const scheduleAutomationSegments=(track:MusicTrack,fromStep:number,toStep:number,baseTime:number,epoch:number)=>{if(epoch!==automationScheduleEpochRef.current)return;const channel=trackChannelRef.current.get(track.id);if(!channel)return;const stepDuration=musicStepDuration(project.tempo);const lanes=(project.automationLanes??[]).filter(lane=>lane.trackId===track.id);for(const lane of lanes){const points=lane.points.filter(point=>point.step<=toStep).sort((a,b)=>a.step-b.step);if(!points.length)continue;const candidates=points.filter(point=>point.step>=fromStep);const first=candidates[0]??points[points.length-1];const previous=points.filter(point=>point.step<fromStep).pop()??first;const startStep=Math.max(fromStep,previous.step);const endPoint=points.find(point=>point.step>startStep)??first;const startValue=evaluateMusicAutomationLane(lane,startStep);if(startValue===undefined)continue;const duration=Math.max(0,(endPoint.step-startStep)*stepDuration);const target=(()=>{if(lane.parameter==='volume')return channel.volume.gain;if(lane.parameter==='pan')return channel.panner.pan;if(lane.parameter==='sendLevel')return lane.targetId?channel.sends.get(lane.targetId)?.gain:undefined;const handle=lane.targetId?liveFxParamRef.current.get(lane.targetId):undefined;if(!handle)return undefined;if(lane.parameter==='effectMix')return handle.mix;if(lane.parameter==='effectFeedback')return handle.feedback;if(lane.parameter==='effectResonance')return handle.resonance;return handle.amount;})();if(!target)continue;const effectType=lane.targetId?track.effects?.find(effect=>effect.id===lane.targetId)?.type:undefined;const map=(value:number)=>mapMusicAutomationValue(lane.parameter,value,effectType);const startTime=baseTime+(startStep-fromStep)*stepDuration;const mappedStart=map(startValue),mappedEnd=map(evaluateMusicAutomationLane(lane,endPoint.step)??startValue);target.cancelScheduledValues(startTime);target.setValueAtTime(mappedStart,startTime);if(lane.interpolation==='step'||duration<=0)target.setValueAtTime(mappedEnd,startTime+duration);else if(lane.interpolation==='linear')target.linearRampToValueAtTime(mappedEnd,startTime+duration);else target.setValueCurveAtTime(new Float32Array([mappedStart,mappedStart+(mappedEnd-mappedStart)*0.15625,mappedStart+(mappedEnd-mappedStart)*0.5,mappedStart+(mappedEnd-mappedStart)*0.84375,mappedEnd]),startTime,duration);}};

    const scheduleStep = (step:number, when:number) => {
      const cycle=Math.floor((when-transportOrigin)/(runtimeSteps*stepDuration));
      const key=`${cycle}:${step}`;
      if(scheduled.has(key))return;
      scheduled.add(key);
      for(const track of audibleMusicTracks(project.tracks)){
        const runtimeNotes=project.arrangement?project.arrangement.clips.filter((clip)=>clip.trackId===track.id).flatMap((clip)=>notesForClip(track,clip)):track.notes;
        for(const note of runtimeNotes.filter((candidate)=>candidate.startStep===step)){
          if(generation!==transportGenerationRef.current||revision!==transportRevisionRef.current)return; const oscillator=ctx.createOscillator(),gain=ctx.createGain(),channel=ensureLiveTrackChannel(ctx,track,step); ownedNodes.add(oscillator);ownedNodes.add(gain);
          scheduleLiveAutomation(track,step,when);
          oscillator.frequency.setValueAtTime(440*Math.pow(2,(note.pitch-69)/12),when);
          oscillator.type=track.instrument==='sub_bass'?'sine':track.instrument==='synth_pad'?'triangle':'sawtooth';
          const durationSec=note.durationSteps*stepDuration;
          gain.gain.setValueAtTime(0.001,when);
          gain.gain.exponentialRampToValueAtTime(note.velocity*0.3,when+0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001,when+durationSec);
          oscillator.connect(gain);gain.connect(channel.input);oscillator.start(when);oscillator.stop(when+durationSec);
        }
      }
    };

    const scheduler=window.setInterval(()=>{
      if(ctx.state!=='running')return;
      const now=ctx.currentTime;
      const elapsed=Math.max(0,now-transportOrigin);
      const first=Math.floor(elapsed/stepDuration);
      const horizon=now+lookaheadSec;
      const last=Math.floor(Math.max(0,horizon-transportOrigin)/stepDuration);
      for(const track of audibleMusicTracks(project.tracks)) scheduleAutomationSegments(track,first,last,transportOrigin+first*stepDuration,automationScheduleEpochRef.current);
      for(let absolute=first;absolute<=last;absolute++){
        const step=((absolute%runtimeSteps)+runtimeSteps)%runtimeSteps;
        scheduleStep(step,transportOrigin+absolute*stepDuration);
      }
      setCurrentStep(((Math.floor(elapsed/stepDuration))%runtimeSteps+runtimeSteps)%runtimeSteps);
    },tickMs);
    schedulerRef.current=scheduler;

    return()=>{automationScheduleEpochRef.current+=1;window.clearInterval(scheduler);if(schedulerRef.current===scheduler)schedulerRef.current=null;for(const node of ownedNodes){try{node.disconnect();}catch{/* ended */}}};
  },[isPlaying,project,transportEpoch]);
  useEffect(() => emergencyStop.registerAbortHandler(() => {
    setIsPlaying(false);
    void audioCtxRef.current?.suspend();
  }), []);

  const seekArrangementFromPointer = (clientX:number) => { const rect=arrangementTimelineRef.current?.getBoundingClientRect(); if(!rect)return; const total=project.arrangement?.totalSteps??project.totalSteps; const ratio=Math.min(1,Math.max(0,(clientX-rect.left)/rect.width)); rescheduleTransport(Math.min(total-1,Math.max(0,Math.round(ratio*(total-1))))); };

  const togglePlay = async () => {
    if (emergencyStop.isEmergencyStopped()) return;
    if (!isPlaying && audioCtxRef.current?.state === 'suspended') await audioCtxRef.current.resume();
    const next = !isPlaying;
    setIsPlaying(next);
    eventBus.emit('CORE_STATE_CHANGE', next ? 'MUSIC MODE' : 'IDLE');
  };

  const handleCellClick = (pitch: number, step: number) => {
    if (!activeTrack) return;
    const existingIndex = activeTrack.notes.findIndex((note) => note.pitch === pitch && note.startStep === step);
    if (existingIndex >= 0) {
      setSelectedNoteId(activeTrack.notes[existingIndex].id);
      return;
    }
    const newNote: NoteEvent = { id: `note_${activeTrackId}_${pitch}_${step}_${activeTrack.notes.length}`, pitch, startStep: step, durationSteps: 2, velocity: 0.85 };
    setProject((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.id === activeTrackId ? { ...track, notes: [...track.notes, newNote] } : track) }));
    setSelectedNoteId(newNote.id);
  };

  const updateSelectedNote = (changes: Partial<NoteEvent>) => {
    if (!selectedNote) return;
    setProject((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.id === activeTrackId ? { ...track, notes: track.notes.map((note) => note.id === selectedNote.id ? { ...note, ...changes } : note) } : track) }));
  };

  const quantizeTrack = (grid = 1) => {
    setProject((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.id === activeTrackId ? { ...track, notes: track.notes.map((note) => quantizeNoteEvent(note, grid, previous.totalSteps)) } : track) }));
  };

  const transposeTrack = (semitones: number) => {
    setProject((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.id === activeTrackId ? { ...track, notes: transposeNotes(track.notes, semitones) } : track) }));
  };

  const nudgeSelectedNote = (steps: number, pitches = 0) => {
    if (!selectedNote) return;
    updateSelectedNote(moveNote(selectedNote, steps, pitches, project.totalSteps));
  };

  const resizeSelectedNote = (delta: number) => {
    if (!selectedNote) return;
    updateSelectedNote(resizeNote(selectedNote, selectedNote.durationSteps + delta, project.totalSteps));
  };

  const deleteSelectedNote = () => {
    if (!selectedNote) return;
    setProject((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.id === activeTrackId ? { ...track, notes: track.notes.filter((note) => note.id !== selectedNote.id) } : track) }));
    setSelectedNoteId(null);
  };

  const addTrack = () => {
    const sequence = project.tracks.length + 1;
    const track: MusicTrack = { id: `trk_custom_${Date.now().toString(36)}`, name: `Track ${sequence}`, role: 'Melody', instrument: 'synth_lead', volume: .75, pan: 0, mute: false, solo: false, notes: [] };
    setProject((previous) => ({ ...previous, tracks: [...previous.tracks, track] })); setActiveTrackId(track.id); setSelectedNoteId(null);
  };

  const exportWav = async () => {
    const stepDuration=musicStepDuration(project.tempo),runtimeSteps=project.arrangement?.totalSteps??project.totalSteps,length=Math.ceil(44100*runtimeSteps*stepDuration),offline=new OfflineAudioContext(2,length,44100);
    const trackChannels=new Map<string,{input:GainNode;volume:GainNode;panner:StereoPannerNode}>();
    const returnChannels=new Map<string,{input:GainNode;output:GainNode}>();
    const ensureReturn=(bus:NonNullable<MioMusicProject['returnBuses']>[number])=>{const existing=returnChannels.get(bus.id);if(existing)return existing;const input=offline.createGain(),output=offline.createGain();output.gain.value=bus.volume;connectTrackEffects(offline,input,{id:`return_${bus.id}`,effects:[bus.effect]} as MusicTrack,output,0);output.connect(offline.destination);const channel={input,output};returnChannels.set(bus.id,channel);return channel;};
    const ensureTrack=(track:MusicTrack)=>{const existing=trackChannels.get(track.id);if(existing)return existing;const input=offline.createGain(),volume=offline.createGain(),panner=offline.createStereoPanner();volume.gain.value=track.volume;input.connect(volume);volume.connect(panner);connectTrackEffects(offline,panner,track,offline.destination,0);panner.pan.value=track.pan;for(const send of track.sends??[]){const bus=project.returnBuses?.find(b=>b.id===send.busId);if(!send.enabled||!bus)continue;const sendGain=offline.createGain();sendGain.gain.value=send.level;panner.connect(sendGain);sendGain.connect(ensureReturn(bus).input);}const channel={input,volume,panner};trackChannels.set(track.id,channel);return channel;};
    for(const track of audibleMusicTracks(project.tracks)){
      const channel=ensureTrack(track);
      for(const lane of (project.automationLanes??[]).filter(l=>l.trackId===track.id)){
        const target=lane.parameter==='volume'?channel.volume.gain:lane.parameter==='pan'?channel.panner.pan:undefined;if(!target)continue;
        const points=lane.points;for(let i=0;i<points.length;i++){const p=points[i],next=points[i+1]??p,t=p.step*stepDuration,value=mapMusicAutomationValue(lane.parameter,p.value);target.setValueAtTime(value,t);if(next!==p&&lane.interpolation!=='step'){const nt=next.step*stepDuration,nv=mapMusicAutomationValue(lane.parameter,next.value);if(lane.interpolation==='linear')target.linearRampToValueAtTime(nv,nt);else target.setValueCurveAtTime(new Float32Array([value,value+(nv-value)*.15625,value+(nv-value)*.5,value+(nv-value)*.84375,nv]),t,Math.max(.001,nt-t));}}
      }
      const notes=project.arrangement?project.arrangement.clips.filter(c=>c.trackId===track.id).flatMap(c=>notesForClip(track,c)):track.notes;
      for(const note of notes){const start=note.startStep*stepDuration,duration=note.durationSteps*stepDuration,oscillator=offline.createOscillator(),gain=offline.createGain();oscillator.frequency.setValueAtTime(440*Math.pow(2,(note.pitch-69)/12),start);oscillator.type=track.instrument==='sub_bass'?'sine':track.instrument==='synth_pad'?'triangle':'sawtooth';gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(Math.max(.001,note.velocity*.3),start+.02);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);oscillator.connect(gain);gain.connect(channel.input);oscillator.start(start);oscillator.stop(start+duration);}
    }
    await ExportManager.exportAudioAsWAV(await offline.startRendering(),'MIO_Music_Project.wav','MUSIC');
  };

  return (
    <div className="relative flex h-full w-full bg-[#07090e] font-mono text-xs overflow-hidden">
      <CreativeWorkspaceToolbar workspace={workspace} />
      <div className="flex-1 flex flex-col p-4 bg-[#0a0e17] overflow-hidden">
        <div className="flex items-center justify-between mb-3 bg-[#0d121d] p-3 rounded-xl border border-gray-800">
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="p-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg shadow-md shadow-cyan-500/20 flex items-center gap-2 cursor-pointer">{isPlaying ? <Square size={14} /> : <Play size={14} />}<span>{isPlaying ? 'STOP' : 'PLAY'}</span></button>
            <button onClick={() => { rescheduleTransport(0); setIsPlaying(false); }} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded cursor-pointer" title="Reset Playhead"><RotateCcw size={14} /></button>
            <div className="flex items-center gap-2 border-l border-gray-800 pl-3"><span className="text-gray-400">BPM:</span><input type="number" value={project.tempo} onChange={(event) => setProject((current) => ({ ...current, tempo: parseInt(event.target.value) || 120 }))} className="w-14 bg-[#141b2b] border border-gray-700 rounded px-1.5 py-0.5 text-white text-center text-xs" /></div>
            <div className="flex items-center gap-2 border-l border-gray-800 pl-3"><span className="text-gray-400">SCALE:</span><span className="text-cyan-300 font-bold">{project.key} {project.scale}</span></div>
            <button onClick={() => void exportWav()} className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-gray-300"><Download size={12} />WAV</button><div className="flex items-center gap-1 border-l border-gray-800 pl-2"><button onClick={() => quantizeTrack(1)} className="rounded border border-gray-700 px-2 py-1 text-cyan-300">Q 1/16</button><button onClick={() => transposeTrack(-12)} className="rounded border border-gray-700 px-2 py-1 text-gray-300">-12</button><button onClick={() => transposeTrack(12)} className="rounded border border-gray-700 px-2 py-1 text-gray-300">+12</button></div>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-950/20 px-2 py-1 rounded border border-amber-500/30"><ShieldCheck size={12} /> LOCAL NOTE SEQUENCE // RIGHTS NOT ASSESSED</span>
        </div>

        <div className="mb-3 rounded-xl border border-gray-800 bg-[#090d16] p-2"><div className="mb-2 flex items-center justify-between"><span className="font-bold text-violet-300">TRACK AUTOMATION</span><div className="flex gap-1"><button disabled={!selectedAutomationPointId} onClick={()=>{if(!selectedAutomationPointId)return;setProject(current=>({...current,automationLanes:(current.automationLanes??[]).map(lane=>lane.trackId===activeTrackId&&lane.parameter===automationParameter&&lane.targetId===resolvedAutomationTargetId?{...lane,points:lane.points.filter(point=>point.id!==selectedAutomationPointId)}:lane)}));setSelectedAutomationPointId(null);}} className="text-[9px] text-red-300 disabled:text-gray-700">DELETE</button><button onClick={()=>setProject(current=>({...current,automationLanes:(current.automationLanes??[]).map(lane=>lane.trackId===activeTrackId&&lane.parameter===automationParameter&&!lane.targetId?{...lane,interpolation:lane.interpolation==='linear'?'step':lane.interpolation==='step'?'smooth':'linear'}:lane)}))} className="text-[9px] text-violet-300">{project.automationLanes?.find(lane=>lane.trackId===activeTrackId&&lane.parameter===automationParameter&&!lane.targetId)?.interpolation?.toUpperCase()??'LINEAR'}</button><select value={automationParameter} onChange={event=>setAutomationParameter(event.target.value as typeof automationParameter)} className="bg-gray-900 text-[10px] text-violet-200"><option value="volume">VOLUME</option><option value="pan">PAN</option><option value="sendLevel">AUX SEND</option><option value="effectAmount">FX AMOUNT</option><option value="effectMix">FX MIX</option><option value="effectFeedback">FX FEEDBACK</option><option value="effectResonance">FX RESONANCE</option></select>{automationNeedsTarget&&<select value={resolvedAutomationTargetId??""} onChange={event=>setAutomationTargetId(event.target.value)} className="bg-gray-900 text-[10px] text-violet-200">{automationTargets.map(target=><option key={target.id} value={target.id}>{target.label}</option>)}</select>}</div></div><div ref={automationEditorRef} onPointerDown={event=>{if(!activeTrack||event.target!==event.currentTarget)return;event.currentTarget.setPointerCapture(event.pointerId);automationDrawRef.current={pointerId:event.pointerId};const rect=event.currentTarget.getBoundingClientRect(),total=project.arrangement?.totalSteps??project.totalSteps,step=Math.max(0,Math.min(total-1,Math.round(((event.clientX-rect.left)/Math.max(1,rect.width))*(total-1)))),value=Math.max(0,Math.min(1,1-(event.clientY-rect.top)/Math.max(1,rect.height))),targetId=resolvedAutomationTargetId;if(automationNeedsTarget&&!targetId)return;const laneId=`automation_${activeTrack.id}_${automationParameter}_${targetId??'track'}`;setProject(current=>{const lanes=current.automationLanes??[],existing=lanes.find(lane=>lane.id===laneId),point={id:`music_auto_${Date.now()}`,step,value};return {...current,automationLanes:existing?lanes.map(lane=>lane.id===laneId?{...lane,points:[...lane.points.filter(item=>item.step!==step),point].sort((a,b)=>a.step-b.step)}:lane):[...lanes,{id:laneId,trackId:activeTrack.id,parameter:automationParameter,targetId,interpolation:'linear',points:[point]}]};});}} onPointerMove={event=>{if(!automationDrawRef.current||automationDrawRef.current.pointerId!==event.pointerId||!activeTrack)return;const rect=event.currentTarget.getBoundingClientRect(),total=project.arrangement?.totalSteps??project.totalSteps,step=Math.max(0,Math.min(total-1,Math.round(((event.clientX-rect.left)/Math.max(1,rect.width))*(total-1)))),value=Math.max(0,Math.min(1,1-(event.clientY-rect.top)/Math.max(1,rect.height))),targetId=resolvedAutomationTargetId;if(automationNeedsTarget&&!targetId)return;const laneId=`automation_${activeTrack.id}_${automationParameter}_${targetId??'track'}`;setProject(current=>{const lanes=current.automationLanes??[],existing=lanes.find(lane=>lane.id===laneId),oldPoint=existing?.points.find(item=>item.step===step),point={id:oldPoint?.id??`music_auto_${Date.now()}_${step}`,step,value};return {...current,automationLanes:existing?lanes.map(lane=>lane.id===laneId?{...lane,points:[...lane.points.filter(item=>item.step!==step),point].sort((a,b)=>a.step-b.step)}:lane):[...lanes,{id:laneId,trackId:activeTrack.id,parameter:automationParameter,targetId,interpolation:'linear',points:[point]}]};});}} onPointerUp={event=>{if(automationDrawRef.current?.pointerId===event.pointerId){automationDrawRef.current=null;event.currentTarget.releasePointerCapture(event.pointerId);}}} onPointerCancel={()=>{automationDrawRef.current=null;}} className="relative h-24 touch-none rounded border border-gray-800 bg-gray-950">{(()=>{const lane=project.automationLanes?.find(item=>item.trackId===activeTrackId&&item.parameter===automationParameter&&item.targetId===resolvedAutomationTargetId),total=project.arrangement?.totalSteps??project.totalSteps;return lane?.points.map(point=><button key={point.id??point.step} aria-label={`Automation point step ${point.step}`} onPointerDown={event=>{event.stopPropagation();if(!point.id)return;event.currentTarget.setPointerCapture(event.pointerId);setSelectedAutomationPointId(point.id);automationDragRef.current={id:point.id,startX:event.clientX,startY:event.clientY,originStep:point.step,originValue:point.value};}} onPointerMove={event=>{const drag=automationDragRef.current,editor=automationEditorRef.current;if(!drag||drag.id!==point.id||!editor)return;const rect=editor.getBoundingClientRect(),total=project.arrangement?.totalSteps??project.totalSteps,stepDelta=Math.round(((event.clientX-drag.startX)/Math.max(1,rect.width))*Math.max(1,total-1)),valueDelta=-(event.clientY-drag.startY)/Math.max(1,rect.height),nextStep=Math.max(0,Math.min(total-1,drag.originStep+stepDelta)),nextValue=Math.max(0,Math.min(1,drag.originValue+valueDelta));setProject(current=>({...current,automationLanes:(current.automationLanes??[]).map(lane=>lane.trackId===activeTrackId&&lane.parameter===automationParameter&&!lane.targetId?{...lane,points:lane.points.map(item=>item.id===drag.id?{...item,step:nextStep,value:nextValue}:item).sort((a,b)=>a.step-b.step)}:lane)}));}} onPointerUp={event=>{if(automationDragRef.current?.id===point.id){automationDragRef.current=null;event.currentTarget.releasePointerCapture(event.pointerId);}}} onPointerCancel={()=>{automationDragRef.current=null;}} className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border ${selectedAutomationPointId===point.id?'border-white bg-violet-300':'border-violet-200 bg-violet-500'}`} style={{left:`${(point.step/Math.max(1,total-1))*100}%`,top:`${(1-point.value)*100}%`}} />);})()}</div><div className="mt-1 text-[9px] text-gray-500">Tap to add · drag points to move · 0–100% normalized automation</div></div>
        <div className="mb-3 rounded-xl border border-gray-800 bg-[#090d16] p-2">
          <div className="mb-2 flex items-center justify-between"><span className="font-bold text-cyan-300">ARRANGEMENT TIMELINE</span><div className="flex items-center gap-1">{selectedClipId&&project.arrangement&&<><button onClick={()=>setProject(current=>{if(!current.arrangement)return current;const clip=current.arrangement.clips.find(item=>item.id===selectedClipId);if(!clip)return current;const copy=duplicateMusicClip(clip,`clip_${Date.now()}`,clip.lengthSteps,current.arrangement.totalSteps);setSelectedClipId(copy.id);return {...current,arrangement:{...current.arrangement,clips:[...current.arrangement.clips,copy]}};})} className="rounded border border-gray-700 px-2 py-1 text-gray-300">DUPLICATE</button><button onClick={()=>setProject(current=>{if(!current.arrangement)return current;const clip=current.arrangement.clips.find(item=>item.id===selectedClipId);if(!clip||clip.lengthSteps<2)return current;const parts=splitMusicClip(clip,clip.startStep+Math.floor(clip.lengthSteps/2),`clip_${Date.now()}_a`,`clip_${Date.now()}_b`,current.arrangement.totalSteps);if(!parts)return current;setSelectedClipId(parts[1].id);return {...current,arrangement:{...current.arrangement,clips:current.arrangement.clips.flatMap(item=>item.id===clip.id?parts:[item])}};})} className="rounded border border-gray-700 px-2 py-1 text-gray-300">SPLIT</button></>}<button onClick={()=>setProject(current=>({...current,arrangement:current.arrangement??{totalSteps:Math.max(32,current.totalSteps),clips:current.tracks.map((track,index)=>({id:`clip_${track.id}`,trackId:track.id,name:track.name,startStep:index*4,lengthSteps:current.totalSteps,sourceStartStep:0,loop:false}))}}))} className="rounded border border-gray-700 px-2 py-1 text-gray-300">INITIALIZE</button></div></div>
          <div ref={arrangementTimelineRef} onPointerDown={(event)=>{if(event.target===event.currentTarget)seekArrangementFromPointer(event.clientX);}} onPointerMove={(event)=>{if(event.buttons===1&&event.target===event.currentTarget)seekArrangementFromPointer(event.clientX);}} className="space-y-1 touch-none">{project.tracks.map(track=><div key={track.id} className="flex h-8 items-center"><span className="w-28 truncate pr-2 text-[9px] text-gray-400">{track.name}</span><div className="relative h-full flex-1 rounded bg-gray-900">{project.arrangement?.clips.filter(clip=>clip.trackId===track.id).map(clip=><button key={clip.id} onClick={()=>{setSelectedClipId(clip.id);setActiveTrackId(track.id);}} onDoubleClick={()=>setProject(current=>({...current,arrangement:current.arrangement?{...current.arrangement,clips:current.arrangement.clips.map(item=>item.id===clip.id?toggleMusicClipLoop(item):item)}:current.arrangement}))} onPointerDown={(event)=>{event.currentTarget.setPointerCapture(event.pointerId);setSelectedClipId(clip.id);setActiveTrackId(track.id);clipDragRef.current={id:clip.id,startX:event.clientX,originStart:clip.startStep};}} onPointerMove={(event)=>{const drag=clipDragRef.current,arr=project.arrangement;if(!drag||drag.id!==clip.id||!arr)return;const lane=event.currentTarget.parentElement;if(!lane)return;const delta=Math.round((event.clientX-drag.startX)/(lane.getBoundingClientRect().width/arr.totalSteps));setProject(current=>({...current,arrangement:current.arrangement?{...current.arrangement,clips:current.arrangement.clips.map(item=>item.id===clip.id?moveMusicClip({...item,startStep:drag.originStart},delta,current.arrangement!.totalSteps):item)}:current.arrangement}));}} onPointerUp={()=>{clipDragRef.current=null;}} onPointerCancel={()=>{clipDragRef.current=null;}} className={`absolute top-1 h-6 rounded border px-1 text-left text-[9px] touch-none ${selectedClipId===clip.id?'border-amber-300 bg-cyan-700':'border-cyan-600 bg-cyan-900'}`} style={{left:`${(clip.startStep/(project.arrangement?.totalSteps||project.totalSteps))*100}%`,width:`${(clip.lengthSteps/(project.arrangement?.totalSteps||project.totalSteps))*100}%`}}>{clip.name}{clip.loop?' ↻':''}<span onPointerDown={(event)=>{event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);clipResizeRef.current={id:clip.id,startX:event.clientX,originLength:clip.lengthSteps};}} onPointerMove={(event)=>{const drag=clipResizeRef.current,arr=project.arrangement;if(!drag||drag.id!==clip.id||!arr)return;const lane=event.currentTarget.parentElement?.parentElement;if(!lane)return;const delta=Math.round((event.clientX-drag.startX)/(lane.getBoundingClientRect().width/arr.totalSteps));setProject(current=>({...current,arrangement:current.arrangement?{...current.arrangement,clips:current.arrangement.clips.map(item=>item.id===clip.id?resizeMusicClip(item,drag.originLength+delta,current.arrangement!.totalSteps):item)}:current.arrangement}));}} onPointerUp={()=>{clipResizeRef.current=null;}} onPointerCancel={()=>{clipResizeRef.current=null;}} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/40 touch-none" /></button>)}<div className="absolute top-0 h-full w-px bg-white/60" style={{left:`${(currentStep/(project.arrangement?.totalSteps||project.totalSteps))*100}%`}} /></div></div>)}</div>
        </div>

        <div className="flex-1 bg-[#090d16] rounded-xl border border-gray-800 flex overflow-hidden">
          <div className="w-16 bg-[#0c111c] border-r border-gray-800 flex flex-col">{pitchRange.map((pitch) => <div key={pitch} className="h-6 shrink-0 flex items-center justify-end pr-2 border-b border-gray-800/40 font-bold text-[10px] text-gray-300">{midiNoteNames[pitch] || pitch}</div>)}</div>
          <div ref={pianoRollRef} className="flex-1 flex flex-col overflow-auto touch-none">{pitchRange.map((pitch) => <div key={pitch} className="h-6 shrink-0 flex border-b border-gray-800/40">{Array.from({ length: project.totalSteps }).map((_, stepIndex) => {
            const hasNote = activeTrack?.notes.some((note) => note.pitch === pitch && note.startStep === stepIndex);
            const pianoStep = currentStep % project.totalSteps;
            const isCurrent = pianoStep === stepIndex;
            const isTransportColumn = pianoStep === stepIndex;
            return <div key={stepIndex} onClick={() => handleCellClick(pitch, stepIndex)} className={`flex-1 border-r border-gray-800/40 cursor-pointer transition relative ${stepIndex % 4 === 0 ? 'border-r-gray-700' : ''} ${isCurrent ? 'bg-cyan-500/20' : hasNote ? 'bg-cyan-500' : 'hover:bg-gray-800/40'} ${isTransportColumn ? 'ring-inset ring-1 ring-cyan-300/30' : ''}`}>{hasNote && (()=>{const note=activeTrack?.notes.find(candidate=>candidate.pitch===pitch&&candidate.startStep===stepIndex);return note?<button aria-label={`Note ${midiNoteNames[pitch]||pitch} step ${stepIndex}`} onPointerDown={(event)=>{event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);setSelectedNoteId(note.id);draggingNoteRef.current={id:note.id,startX:event.clientX,startY:event.clientY,originStep:note.startStep,originPitch:note.pitch};}} onPointerMove={(event)=>{if(draggingNoteRef.current?.id===note.id)moveNoteFromPointer(event.clientX,event.clientY);}} onPointerUp={()=>{draggingNoteRef.current=null;}} onPointerCancel={()=>{draggingNoteRef.current=null;}} style={{width:`calc(${Math.max(1,note.durationSteps)*100}% + ${(Math.max(1,note.durationSteps)-1)}px)`}} className={`absolute inset-y-0 left-0 z-10 bg-cyan-400 border rounded shadow-sm shadow-cyan-400 touch-none ${selectedNoteId===note.id?'border-amber-200 ring-1 ring-amber-300':'border-white'}`}><span onPointerDown={(event)=>{event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);setSelectedNoteId(note.id);resizingNoteRef.current={id:note.id,startX:event.clientX,originDuration:note.durationSteps};}} onPointerMove={(event)=>{if(resizingNoteRef.current?.id===note.id)resizeNoteFromPointer(event.clientX);}} onPointerUp={()=>{resizingNoteRef.current=null;}} onPointerCancel={()=>{resizingNoteRef.current=null;}} aria-label={`Resize ${midiNoteNames[pitch]||pitch} note`} className="absolute right-0 top-0 h-full w-3 cursor-ew-resize bg-white/50 touch-none" /></button>:null;})()}</div>;
          })}</div>)}</div>
        </div>
      </div>

      <div className="w-80 h-full bg-[#0d121d] border-l border-gray-800 p-4 flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3"><span className="text-gray-300 font-bold flex items-center gap-2"><Music size={14} className="text-cyan-400" /> MIO TRACK MIXER</span><button onClick={addTrack} className="flex items-center gap-1 text-cyan-300"><Plus size={12} />TRACK</button></div>
        <div className="space-y-3 flex-1 overflow-y-auto">{project.tracks.map((track) => <div key={track.id} onClick={() => { setActiveTrackId(track.id); setSelectedNoteId(null); }} className={`p-3 rounded-lg border cursor-pointer transition ${activeTrackId === track.id ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-300' : 'bg-[#111726] border-gray-800 text-gray-400 hover:border-gray-700'}`}>
          <div className="flex items-center justify-between mb-2"><span className="font-bold">{track.name}</span><span className="text-[10px] text-gray-400">{track.role}</span></div>
          <div className="mb-2"><div className="flex justify-between text-[9px] text-gray-500"><span>METER</span><span>{estimateTrackMeter(track).db === -Infinity ? '-∞' : estimateTrackMeter(track).db.toFixed(1)} dB</span></div><div className="h-1.5 overflow-hidden rounded bg-gray-900"><div className="h-full bg-cyan-400" style={{ width: `${Math.round(estimateTrackMeter(track).peak * 100)}%` }} /></div></div><div className="space-y-1"><div className="flex justify-between text-[10px] text-gray-400"><span>Gain:</span><span>{Math.round(track.volume * 100)}%</span></div><input type="range" min="0" max="1" step="0.05" value={track.volume} onChange={(event) => { const volume = parseFloat(event.target.value); setProject((current) => ({ ...current, tracks: current.tracks.map((candidate) => candidate.id === track.id ? { ...candidate, volume } : candidate) })); }} className="w-full accent-cyan-400" /></div>
          <div className="space-y-1"><div className="flex justify-between text-[10px] text-gray-400"><span>Pan:</span><span>{track.pan.toFixed(2)}</span></div><input type="range" min="-1" max="1" step="0.05" value={track.pan} onChange={(event) => { const pan = Number(event.target.value); setProject((current) => ({ ...current, tracks: current.tracks.map((candidate) => candidate.id === track.id ? { ...candidate, pan } : candidate) })); }} className="w-full accent-cyan-400" /></div>
          <div className="mt-2 border-t border-gray-800 pt-2"><div className="mb-1 flex items-center justify-between text-[9px] text-gray-500"><span>INSERT FX</span><button onClick={(event)=>{event.stopPropagation();setProject(current=>({...current,tracks:current.tracks.map(candidate=>candidate.id===track.id?{...candidate,effects:[...(candidate.effects??[]),{id:`fx_${Date.now()}`,type:'lowpass',enabled:true,amount:0.5,mix:0.35,feedback:0.25,resonance:0.1}]}:candidate)}));}} className="text-cyan-300">+ FX</button></div>{(track.effects??[]).map((effect,effectIndex)=><div key={effect.id} className="mb-1 grid grid-cols-[52px_1fr_auto] items-center gap-1"><select aria-label="Effect type" value={effect.type} onClick={event=>event.stopPropagation()} onChange={event=>{const type=event.target.value as 'gain'|'lowpass'|'delay';setProject(current=>({...current,tracks:current.tracks.map(candidate=>candidate.id===track.id?{...candidate,effects:(candidate.effects??[]).map(item=>item.id===effect.id?{...item,type}:item)}:candidate)}));}} className="bg-gray-900 text-[8px] text-cyan-200"><option value="gain">GAIN</option><option value="lowpass">LPF</option><option value="delay">DELAY</option></select><button onClick={(event)=>{event.stopPropagation();setProject(current=>({...current,tracks:current.tracks.map(candidate=>candidate.id===track.id?{...candidate,effects:(candidate.effects??[]).map(item=>item.id===effect.id?{...item,enabled:!item.enabled}:item)}:candidate)}));}} className={`w-12 rounded px-1 text-[8px] ${effect.enabled?'bg-cyan-900 text-cyan-200':'bg-gray-800 text-gray-500'}`}>{effect.type.toUpperCase()}</button><div className="flex items-center gap-1"><input aria-label={`${effect.type} amount`} type="range" min="0" max="1" step="0.05" value={effect.amount} onChange={(event)=>{const amount=Number(event.target.value);setProject(current=>({...current,tracks:current.tracks.map(candidate=>candidate.id===track.id?{...candidate,effects:(candidate.effects??[]).map(item=>item.id===effect.id?{...item,amount}:item)}:candidate)}));}} className="min-w-0 flex-1 accent-cyan-400" />{effect.type==='delay'&&<input aria-label="Delay mix" type="range" min="0" max="1" step="0.05" value={effect.mix??0.35} onChange={event=>{const mix=Number(event.target.value);setProject(current=>({...current,tracks:current.tracks.map(candidate=>candidate.id===track.id?{...candidate,effects:(candidate.effects??[]).map(item=>item.id===effect.id?{...item,mix}:item)}:candidate)}));}} className="w-12 accent-cyan-400" />}{effect.type==='lowpass'&&<input aria-label="Filter resonance" type="range" min="0" max="1" step="0.05" value={effect.resonance??0} onChange={event=>{const resonance=Number(event.target.value);setProject(current=>({...current,tracks:current.tracks.map(candidate=>candidate.id===track.id?{...candidate,effects:(candidate.effects??[]).map(item=>item.id===effect.id?{...item,resonance}:item)}:candidate)}));}} className="w-12 accent-cyan-400" />}</div><div className="flex"><button aria-label="Move effect up" disabled={effectIndex===0} onClick={event=>{event.stopPropagation();setProject(current=>({...current,tracks:current.tracks.map(candidate=>{if(candidate.id!==track.id)return candidate;const effects=[...(candidate.effects??[])];const index=effects.findIndex(item=>item.id===effect.id);if(index>0)[effects[index-1],effects[index]]=[effects[index],effects[index-1]];return {...candidate,effects};})}));}} className="px-1 text-gray-400">↑</button><button aria-label="Remove effect" onClick={event=>{event.stopPropagation();setProject(current=>({...current,tracks:current.tracks.map(candidate=>candidate.id===track.id?{...candidate,effects:(candidate.effects??[]).filter(item=>item.id!==effect.id)}:candidate)}));}} className="px-1 text-red-400">×</button></div></div>)}</div><div className="flex items-center justify-end gap-2 mt-2"><button onClick={(event) => { event.stopPropagation(); setProject((current) => ({ ...current, tracks: current.tracks.map((candidate) => candidate.id === track.id ? { ...candidate, solo: !candidate.solo } : candidate) })); }} className={`px-2 py-0.5 rounded text-[10px] font-bold ${track.solo ? 'bg-amber-400 text-black' : 'bg-gray-800 text-gray-400'}`}>SOLO</button><button onClick={(event) => { event.stopPropagation(); setProject((current) => ({ ...current, tracks: current.tracks.map((candidate) => candidate.id === track.id ? { ...candidate, mute: !candidate.mute } : candidate) })); }} className={`px-2 py-0.5 rounded text-[10px] font-bold ${track.mute ? 'bg-red-500 text-black' : 'bg-gray-800 text-gray-400'}`}>{track.mute ? 'MUTED' : 'MUTE'}</button></div>
        </div>)}</div><div className="border-t border-gray-800 pt-2"><div className="flex items-center justify-between text-[9px] text-gray-500"><span>RETURN BUSES</span><button onClick={()=>setProject(current=>({...current,returnBuses:[...(current.returnBuses??[]),{id:`return_${Date.now()}`,name:`AUX ${(current.returnBuses?.length??0)+1}`,effect:{id:`return_fx_${Date.now()}`,type:'delay',enabled:true,amount:0.3,mix:1,feedback:0.25},volume:0.5}]}))} className="text-violet-300">+ AUX</button></div>{(project.returnBuses??[]).map(bus=><div key={bus.id} className="mt-1 flex items-center gap-1"><span className="w-12 truncate text-[8px] text-violet-200">{bus.name}</span><select aria-label={`${bus.name} effect`} value={bus.effect.type} onChange={event=>{const type=event.target.value as 'gain'|'lowpass'|'delay';setProject(current=>({...current,returnBuses:(current.returnBuses??[]).map(item=>item.id===bus.id?{...item,effect:{...item.effect,type}}:item)}));}} className="bg-gray-900 text-[8px]"><option value="gain">GAIN</option><option value="lowpass">LPF</option><option value="delay">DELAY</option></select><input aria-label={`${bus.name} volume`} type="range" min="0" max="1" step="0.05" value={bus.volume} onChange={event=>{const volume=Number(event.target.value);setProject(current=>({...current,returnBuses:(current.returnBuses??[]).map(item=>item.id===bus.id?{...item,volume}:item)}));}} className="min-w-0 flex-1 accent-violet-400" /></div>)}</div>
        {selectedNote && <div className="space-y-2 border-t border-gray-800 pt-3"><div className="flex justify-between font-bold text-cyan-300"><span>NOTE {midiNoteNames[selectedNote.pitch] ?? selectedNote.pitch}</span><button onClick={deleteSelectedNote} className="text-red-400"><Trash2 size={12} /></button></div><label className="block text-gray-500">LENGTH<input type="number" min="1" max={project.totalSteps} value={selectedNote.durationSteps} onChange={(event) => updateSelectedNote({ durationSteps: Math.max(1, Number(event.target.value)) })} className="ml-2 w-16 rounded border border-gray-700 bg-[#141b2b] px-1 text-white" /></label><div className="grid grid-cols-4 gap-1"><button onClick={() => nudgeSelectedNote(-1)} className="rounded bg-gray-800 py-1">←</button><button onClick={() => nudgeSelectedNote(1)} className="rounded bg-gray-800 py-1">→</button><button onClick={() => resizeSelectedNote(-1)} className="rounded bg-gray-800 py-1">−LEN</button><button onClick={() => resizeSelectedNote(1)} className="rounded bg-gray-800 py-1">+LEN</button></div><label className="block text-gray-500">VELOCITY {selectedNote.velocity.toFixed(2)}<input type="range" min="0.05" max="1" step="0.05" value={selectedNote.velocity} onChange={(event) => updateSelectedNote({ velocity: Number(event.target.value) })} className="w-full accent-cyan-400" /></label></div>}
      </div>
    </div>
  );
};

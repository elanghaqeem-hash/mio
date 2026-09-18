import { duplicateMusicNote, moveMusicNote, musicPlayheadStep, musicProjectDuration, quantizeMusicNote, resizeMusicNote } from '../creative/AudioWorkspace';
import type { NoteEvent } from '../types/creative';

interface Result { name:string; passed:boolean; error?:string }
const assert=(condition:unknown,message:string):void=>{if(!condition)throw new Error(message)};
const test=async(name:string,run:()=>void|Promise<void>):Promise<Result>=>{try{await run();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}};
const note:NoteEvent={id:'n1',pitch:60,startStep:3,durationSteps:4,velocity:.8};

export async function runMusicSequencerCoreTests():Promise<{passed:number;total:number}>{
 const results:Result[]=[];
 results.push(await test('note move clamps pitch and sequencer boundaries',()=>{
   const moved=moveMusicNote(note,99,99,16);
   assert(moved.startStep===15,'note escaped sequence end');
   assert(moved.pitch===127,'pitch escaped MIDI range');
   assert(moved.durationSteps===1,'duration was not trimmed at sequence end');
 }));
 results.push(await test('note resize and duplicate preserve valid sequence events',()=>{
   const resized=resizeMusicNote(note,99,16);
   assert(resized.durationSteps===13,'resize did not clamp to available steps');
   const duplicate=duplicateMusicNote(note,16,'n2');
   assert(duplicate.id==='n2'&&duplicate.startStep===7,'duplicate placement is incorrect');
 }));
 results.push(await test('quantize uses deterministic step grid',()=>{
   const quantized=quantizeMusicNote(note,4,16);
   assert(quantized.startStep===4,'quantize did not snap to nearest grid');
 }));
 results.push(await test('transport duration and playhead derive from project tempo',()=>{
   assert(musicProjectDuration(120,16)===2,'16 sixteenth steps at 120 BPM should be 2 seconds');
   assert(musicPlayheadStep(.5,120,16)===4,'playhead step is incorrect');
   assert(musicPlayheadStep(2.125,120,16)===1,'looped playhead step is incorrect');
 }));
 for(const result of results)console.log(`${result.passed?'✓':'✗'} [${result.passed?'PASS':'FAIL'}] ${result.name}${result.error?` — ${result.error}`:''}`);
 return{passed:results.filter(item=>item.passed).length,total:results.length};
}

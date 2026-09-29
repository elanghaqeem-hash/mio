export interface VideoFrameFingerprint{timestampSeconds:number;hash64:string;}
export interface VideoFingerprint{frames:VideoFrameFingerprint[];algorithm:'sampled-dhash64-v1';analyzerVersion:'mio-video-fingerprint-v1';}
const validHash=(h:string)=>/^[0-9a-f]{16}$/i.test(h);
const bits=(h:string)=>BigInt('0x'+h);
const popcount=(n:bigint)=>{let c=0;for(let v=n;v;v&=v-1n)c++;return c;};
export function createVideoFingerprint(frames:readonly VideoFrameFingerprint[]):VideoFingerprint{
 if(frames.length===0||frames.length>120)throw new Error('Video fingerprint requires 1..120 sampled frames');
 const sorted=[...frames].sort((a,b)=>a.timestampSeconds-b.timestampSeconds||a.hash64.localeCompare(b.hash64));
 for(let i=0;i<sorted.length;i++){const f=sorted[i];if(!Number.isFinite(f.timestampSeconds)||f.timestampSeconds<0||!validHash(f.hash64))throw new Error('Invalid sampled-frame fingerprint');if(i&&f.timestampSeconds===sorted[i-1].timestampSeconds)throw new Error('Duplicate video fingerprint timestamp');}
 return {frames:sorted,algorithm:'sampled-dhash64-v1',analyzerVersion:'mio-video-fingerprint-v1'};
}
export function videoFingerprintSimilarity(a:VideoFingerprint,b:VideoFingerprint):number{
 if(a.frames.length===0||b.frames.length===0)return 0;
 const n=Math.min(a.frames.length,b.frames.length);let score=0;
 for(let i=0;i<n;i++){const distance=popcount(bits(a.frames[Math.floor(i*a.frames.length/n)].hash64)^bits(b.frames[Math.floor(i*b.frames.length/n)].hash64));score+=1-distance/64;}
 return Math.max(0,Math.min(1,score/n));
}

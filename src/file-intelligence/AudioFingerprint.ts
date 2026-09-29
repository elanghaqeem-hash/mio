export interface AudioFingerprintFrame{startSeconds:number;endSeconds:number;hash64:string;}
export interface AudioFingerprint{frames:AudioFingerprintFrame[];algorithm:'window-hash64-v1';analyzerVersion:'mio-audio-fingerprint-v1';}
const validHash=(h:string)=>/^[0-9a-f]{16}$/i.test(h);
const bits=(h:string)=>BigInt('0x'+h);
const popcount=(n:bigint)=>{let c=0;for(let v=n;v;v&=v-1n)c++;return c;};
export function createAudioFingerprint(frames:readonly AudioFingerprintFrame[]):AudioFingerprint{
 if(frames.length===0||frames.length>512)throw new Error('Audio fingerprint requires 1..512 bounded windows');
 const sorted=[...frames].sort((a,b)=>a.startSeconds-b.startSeconds||a.endSeconds-b.endSeconds);
 let previousEnd=0;
 for(const f of sorted){if(!Number.isFinite(f.startSeconds)||!Number.isFinite(f.endSeconds)||f.startSeconds<0||f.endSeconds<=f.startSeconds||!validHash(f.hash64))throw new Error('Invalid audio fingerprint window');if(f.startSeconds<previousEnd)throw new Error('Audio fingerprint windows must not overlap');previousEnd=f.endSeconds;}
 return {frames:sorted,algorithm:'window-hash64-v1',analyzerVersion:'mio-audio-fingerprint-v1'};
}
export function audioFingerprintSimilarity(a:AudioFingerprint,b:AudioFingerprint):number{
 const n=Math.min(a.frames.length,b.frames.length);if(n===0)return 0;let score=0;
 for(let i=0;i<n;i++){const x=a.frames[Math.floor(i*a.frames.length/n)],y=b.frames[Math.floor(i*b.frames.length/n)];score+=1-popcount(bits(x.hash64)^bits(y.hash64))/64;}
 return Math.max(0,Math.min(1,score/n));
}

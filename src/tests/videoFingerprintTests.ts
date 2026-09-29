import { createVideoFingerprint,videoFingerprintSimilarity } from '../file-intelligence/VideoFingerprint';
interface SuiteResult{passed:number;total:number}
export async function runVideoFingerprintTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`VideoFingerprint test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const a=createVideoFingerprint([{timestampSeconds:10,hash64:'0000000000000000'},{timestampSeconds:0,hash64:'ffffffffffffffff'}]);
 check(a.frames[0].timestampSeconds===0,'Fingerprint frames sort deterministically');
 check(videoFingerprintSimilarity(a,a)===1,'Identical sampled fingerprints score 1');
 const b=createVideoFingerprint([{timestampSeconds:0,hash64:'0000000000000000'},{timestampSeconds:10,hash64:'ffffffffffffffff'}]);
 check(videoFingerprintSimilarity(a,b)===0,'Opposite aligned hashes score 0');
 let malformed=false;try{createVideoFingerprint([{timestampSeconds:0,hash64:'xyz'}]);}catch{malformed=true;}check(malformed,'Malformed dHash is rejected');
 let duplicate=false;try{createVideoFingerprint([{timestampSeconds:0,hash64:'0000000000000000'},{timestampSeconds:0,hash64:'1111111111111111'}]);}catch{duplicate=true;}check(duplicate,'Duplicate sample timestamps are rejected');
 return {passed,total};
}

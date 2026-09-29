import { audioFingerprintSimilarity,createAudioFingerprint } from '../file-intelligence/AudioFingerprint';
interface SuiteResult{passed:number;total:number}
export async function runAudioFingerprintTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`AudioFingerprint test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const a=createAudioFingerprint([{startSeconds:5,endSeconds:10,hash64:'0000000000000000'},{startSeconds:0,endSeconds:5,hash64:'ffffffffffffffff'}]);
 check(a.frames[0].startSeconds===0,'Audio windows sort deterministically');
 check(audioFingerprintSimilarity(a,a)===1,'Identical audio fingerprints score 1');
 const b=createAudioFingerprint([{startSeconds:0,endSeconds:5,hash64:'0000000000000000'},{startSeconds:5,endSeconds:10,hash64:'ffffffffffffffff'}]);
 check(audioFingerprintSimilarity(a,b)===0,'Opposite aligned hashes score 0');
 let overlap=false;try{createAudioFingerprint([{startSeconds:0,endSeconds:5,hash64:'0000000000000000'},{startSeconds:4,endSeconds:6,hash64:'1111111111111111'}]);}catch{overlap=true;}check(overlap,'Overlapping fingerprint windows are rejected');
 let malformed=false;try{createAudioFingerprint([{startSeconds:0,endSeconds:1,hash64:'bad'}]);}catch{malformed=true;}check(malformed,'Malformed audio hash is rejected');
 return {passed,total};
}

import { bridgeVideoFrameToImageIntelligence } from '../file-intelligence/VideoFrameImageBridge';
interface SuiteResult{passed:number;total:number}
export async function runVideoFrameImageBridgeTests():Promise<SuiteResult>{
 let passed=0,total=0;const check=(c:boolean,l:string)=>{total++;if(!c)throw new Error(`VideoFrameImageBridge test failed: ${l}`);passed++;console.log(`✓ [PASS] ${l}`);};
 const e=bridgeVideoFrameToImageIntelligence({timestampSeconds:5,width:1920,height:1080,sampleReason:'INTERVAL',source:'LOCAL_DECODER',decoderId:'decoder-test',externalProcessing:false});
 check(e.imageIntelligenceReady&&e.decoderId==='decoder-test','Extracted frame becomes T-3-ready evidence with provenance');
 let fakeLocal=false;try{bridgeVideoFrameToImageIntelligence({...e,source:'EXTERNAL_DECODER',externalProcessing:false});}catch{fakeLocal=true;}check(fakeLocal,'External decoder cannot masquerade as local');
 let dimensions=false;try{bridgeVideoFrameToImageIntelligence({...e,width:0});}catch{dimensions=true;}check(dimensions,'Invalid frame dimensions are rejected');
 return {passed,total};
}

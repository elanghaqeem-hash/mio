import { enforceMioVoiceRateLimit, mioVoiceRateLimitRequired } from '../../functions/api/voice/_rateLimit';
export async function runMioVoiceRateLimitGatewayTests():Promise<{passed:number;total:number}>{
 const allow={limit:async()=>({success:true})}; const deny={limit:async()=>({success:false})}; const broken={limit:async()=>{throw new Error('down')}};
 const checks=[
  mioVoiceRateLimitRequired('true'),!mioVoiceRateLimitRequired('false'),
  await enforceMioVoiceRateLimit(allow,true,'u')==='allowed',
  await enforceMioVoiceRateLimit(deny,true,'u')==='limited',
  await enforceMioVoiceRateLimit(undefined,true,'u')==='unavailable',
  await enforceMioVoiceRateLimit(undefined,false,'u')==='allowed',
  await enforceMioVoiceRateLimit(broken,true,'u')==='unavailable',
  await enforceMioVoiceRateLimit(broken,false,'u')==='allowed',
 ];
 if(checks.some(v=>!v)) throw new Error('Mio rate-limit gateway regression');
 return {passed:checks.length,total:checks.length};
}

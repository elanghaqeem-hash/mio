export type RemoteProcessingDecision={allowed:boolean;reason:string};
export interface RemoteProcessingPolicy{remoteEnabled:boolean;explicitConsent:boolean;allowSensitiveContent:boolean;}
export function authorizeRemoteProcessing(input:{privacy:'LOCAL_ONLY'|'REMOTE_ALLOWED';sensitive:boolean},policy:RemoteProcessingPolicy):RemoteProcessingDecision{
 if(input.privacy==='LOCAL_ONLY')return {allowed:false,reason:'Request requires local-only processing'};
 if(!policy.remoteEnabled)return {allowed:false,reason:'Remote processing is disabled'};
 if(!policy.explicitConsent)return {allowed:false,reason:'Explicit remote-processing consent is required'};
 if(input.sensitive&&!policy.allowSensitiveContent)return {allowed:false,reason:'Sensitive content is not authorized for remote processing'};
 return {allowed:true,reason:'Remote processing explicitly authorized'};
}
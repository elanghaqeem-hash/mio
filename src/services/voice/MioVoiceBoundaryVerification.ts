export interface MioVoiceBoundaryProbe {
  unauthenticatedStatus: number;
  authenticatedStatus: number;
  authenticatedSessionHeader: string | null;
  rateLimitedStatus?: number;
  retryAfter?: string | null;
}

export interface MioVoiceBoundaryVerification {
  sessionVerified: boolean;
  rateLimitVerified: boolean;
  blockers: string[];
}

export function evaluateMioVoiceBoundaryProbe(p:MioVoiceBoundaryProbe):MioVoiceBoundaryVerification {
 const sessionVerified=p.unauthenticatedStatus===401 && p.authenticatedStatus===200 && p.authenticatedSessionHeader==='authenticated';
 const retry=Number.parseInt(p.retryAfter??'',10);
 const rateLimitVerified=p.rateLimitedStatus===429 && Number.isFinite(retry) && retry>=1 && retry<=3600;
 const blockers:string[]=[];
 if(!sessionVerified) blockers.push('session-boundary');
 if(!rateLimitVerified) blockers.push('distributed-rate-limit-enforcement');
 return {sessionVerified,rateLimitVerified,blockers};
}

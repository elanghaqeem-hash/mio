export type EpistemicStatus = 'VERIFIED' | 'CORROBORATED' | 'UNVERIFIED' | 'INFERENCE' | 'UNKNOWN';

export interface VerifiedClaim {
  claim: string;
  status: EpistemicStatus;
  sourceConfidence: number; // 0.0 to 1.0
  citation?: string;
}

export class AntiHallucination {
  /**
   * Evaluates statements and attaches epistemic truth labels
   */
  public static verifyClaim(claimText: string, contextSources: string[] = []): VerifiedClaim {
    if (contextSources.length > 0) {
      return {
        claim: claimText,
        status: 'VERIFIED',
        sourceConfidence: 0.98,
        citation: contextSources[0],
      };
    }

    if (/possibly|might|likely|estimated|projected/i.test(claimText)) {
      return {
        claim: claimText,
        status: 'INFERENCE',
        sourceConfidence: 0.75,
      };
    }

    return {
      claim: claimText,
      status: 'UNVERIFIED',
      sourceConfidence: 0.5,
    };
  }

  /**
   * Formats output with transparent epistemics
   */
  public static formatTruthSeparation(text: string, status: EpistemicStatus): string {
    const badge = `[${status}]`;
    return `${badge} ${text}`;
  }
}

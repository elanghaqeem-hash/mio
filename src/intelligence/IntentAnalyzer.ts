import type { MioSystemMode } from '../types/core';

export interface IntentAnalysis {
  rawInput: string;
  normalizedInput: string;
  suggestedMode: MioSystemMode;
  sensitive: boolean;
  confidence: number;
  signals: string[];
}

const modeRules: Array<{ mode: MioSystemMode; patterns: RegExp[] }> = [
  { mode: 'RESEARCH', patterns: [/\bsearch\b/i, /\bresearch\b/i, /find info/i, /documentation/i] },
  { mode: 'PROJECT', patterns: [/project status/i, /project overview/i, /current project/i, /workspace status/i] },
  { mode: 'FILES', patterns: [/\bfile\b/i, /organize/i, /directory/i, /duplicate/i] },
  { mode: 'MOTION', patterns: [/motion/i, /pose/i, /camera/i, /gesture/i] },
  { mode: '3D', patterns: [/\b3d\b/i, /mesh/i, /\bmodel\b/i, /geometry/i] },
  { mode: 'ANIMATION', patterns: [/animat/i, /keyframe/i, /motion path/i] },
  { mode: 'GRAPHIC', patterns: [/poster/i, /graphic/i, /layer/i, /vector/i, /typography/i] },
  { mode: 'SFX', patterns: [/\bsfx\b/i, /sound effect/i, /synth sound/i, /laser sound/i] },
  { mode: 'MUSIC', patterns: [/music/i, /piano/i, /compose/i, /melody/i, /\bbpm\b/i] },
  { mode: 'SECURITY', patterns: [/security/i, /permission/i, /audit/i] },
];

const sensitivePattern = /delete|overwrite|wipe|publish|upload|network|camera|microphone/i;

export class IntentAnalyzer {
  public static analyze(input: string): IntentAnalysis {
    const normalizedInput = input.trim().replace(/\s+/g, ' ');
    let suggestedMode: MioSystemMode = 'CHAT';
    const signals: string[] = [];

    for (const rule of modeRules) {
      const matched = rule.patterns.filter((pattern) => pattern.test(normalizedInput));
      if (matched.length > 0) {
        suggestedMode = rule.mode;
        signals.push(...matched.map((pattern) => `${rule.mode}:${pattern.source}`));
        break;
      }
    }

    const sensitive = sensitivePattern.test(normalizedInput);
    if (sensitive) signals.push('SECURITY:sensitive-operation');

    return {
      rawInput: input,
      normalizedInput,
      suggestedMode,
      sensitive,
      confidence: signals.length > 0 ? 0.8 : 0.55,
      signals,
    };
  }
}

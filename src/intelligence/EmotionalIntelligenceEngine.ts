export type MioEmotion =
  | 'NEUTRAL' | 'STRESS' | 'ANXIETY' | 'SADNESS' | 'FRUSTRATION'
  | 'ANGER' | 'EXHAUSTION' | 'LONELINESS' | 'FEAR' | 'JOY' | 'PRIDE' | 'GRIEF';

export type CompanionIntent =
  | 'GENERAL' | 'SEEKING_PRESENCE' | 'SEEKING_VALIDATION' | 'VENTING'
  | 'SEEKING_PERSPECTIVE' | 'SEEKING_SOLUTION' | 'CELEBRATING';

export type CompanionStrategy =
  | 'NORMAL' | 'LISTEN_FIRST' | 'ACKNOWLEDGE_AND_LISTEN' | 'ACKNOWLEDGE_AND_SOLVE'
  | 'GENTLE_PERSPECTIVE' | 'CELEBRATE_WITH_USER';

export interface EmotionalAssessment {
  primaryEmotion: MioEmotion;
  secondaryEmotions: MioEmotion[];
  intensity: 'LOW' | 'MEDIUM' | 'HIGH';
  intent: CompanionIntent;
  strategy: CompanionStrategy;
  solutionRequested: boolean;
  confidence: number;
  signals: string[];
}

type Rule = { emotion: MioEmotion; patterns: RegExp[] };

const RULES: Rule[] = [
  { emotion: 'STRESS', patterns: [/stres(?:s|ed)?/i, /overwhelmed/i, /tertekan/i, /banyak pikiran/i] },
  { emotion: 'ANXIETY', patterns: [/anxious/i, /cemas/i, /khawatir/i, /gelisah/i, /deg-degan/i] },
  { emotion: 'SADNESS', patterns: [/sedih/i, /down\b/i, /kecewa/i, /patah hati/i, /menangis/i] },
  { emotion: 'FRUSTRATION', patterns: [/frustrat/i, /kesal/i, /sebel/i, /jengkel/i, /mentok/i] },
  { emotion: 'ANGER', patterns: [/marah/i, /angry/i, /geram/i] },
  { emotion: 'EXHAUSTION', patterns: [/capek/i, /cape\b/i, /lelah/i, /exhausted/i, /tired/i, /burnout/i] },
  { emotion: 'LONELINESS', patterns: [/kesepian/i, /sendirian/i, /lonely/i, /nggak ada teman/i, /tidak ada teman/i] },
  { emotion: 'FEAR', patterns: [/takut/i, /fear/i, /scared/i, /ngeri/i] },
  { emotion: 'JOY', patterns: [/senang/i, /bahagia/i, /happy/i, /gembira/i, /lega banget/i] },
  { emotion: 'PRIDE', patterns: [/bangga/i, /proud/i, /akhirnya berhasil/i, /aku berhasil/i, /saya berhasil/i] },
  { emotion: 'GRIEF', patterns: [/berduka/i, /kehilangan .* meninggal/i, /meninggal dunia/i, /passed away/i, /grieving/i] },
];

const SOLUTION = /(?:tolong|bantu|help|gimana|bagaimana|apa yang harus|solusi|saran|advice|jalan keluar|menurutmu|menurut mio)/i;
const PRESENCE = /(?:temani|dengerin|dengarkan|aku mau cerita|saya mau cerita|curhat|jangan kasih solusi|nggak perlu solusi|tidak perlu solusi|cuma ingin cerita)/i;
const PERSPECTIVE = /(?:menurutmu|perspektif|pendapatmu|apa aku salah|apa saya salah|lihat dari sisi lain)/i;
const CELEBRATION = /(?:berhasil|lulus|menang|promosi|diterima|akhirnya selesai|good news|kabar baik)/i;

export class EmotionalIntelligenceEngine {
  public static analyze(text: string): EmotionalAssessment {
    const signals: string[] = [];
    const emotions: MioEmotion[] = [];
    for (const rule of RULES) {
      if (rule.patterns.some((pattern) => pattern.test(text))) {
        emotions.push(rule.emotion);
        signals.push(`emotion:${rule.emotion}`);
      }
    }

    const solutionRequested = SOLUTION.test(text) && !PRESENCE.test(text);
    const presenceRequested = PRESENCE.test(text);
    const perspectiveRequested = PERSPECTIVE.test(text);
    const celebrating = CELEBRATION.test(text) && emotions.some((emotion) => emotion === 'JOY' || emotion === 'PRIDE');

    let intent: CompanionIntent = 'GENERAL';
    let strategy: CompanionStrategy = 'NORMAL';
    if (celebrating) { intent = 'CELEBRATING'; strategy = 'CELEBRATE_WITH_USER'; }
    else if (presenceRequested) { intent = 'SEEKING_PRESENCE'; strategy = 'LISTEN_FIRST'; }
    else if (solutionRequested && emotions.length > 0) { intent = 'SEEKING_SOLUTION'; strategy = 'ACKNOWLEDGE_AND_SOLVE'; }
    else if (perspectiveRequested) { intent = 'SEEKING_PERSPECTIVE'; strategy = 'GENTLE_PERSPECTIVE'; }
    else if (emotions.length > 0) { intent = 'VENTING'; strategy = 'ACKNOWLEDGE_AND_LISTEN'; }

    const high = /(?:banget|sangat|really|extremely|parah|berat banget|nggak kuat|tidak kuat)/i.test(text);
    const intensity: EmotionalAssessment['intensity'] = high ? 'HIGH' : emotions.length > 1 ? 'MEDIUM' : emotions.length === 1 ? 'MEDIUM' : 'LOW';
    if (solutionRequested) signals.push('intent:solution');
    if (presenceRequested) signals.push('intent:presence');

    return {
      primaryEmotion: emotions[0] ?? 'NEUTRAL',
      secondaryEmotions: emotions.slice(1),
      intensity,
      intent,
      strategy,
      solutionRequested,
      confidence: emotions.length > 0 || intent !== 'GENERAL' ? 0.78 : 0.45,
      signals,
    };
  }

  public static systemGuidance(assessment: EmotionalAssessment): string {
    if (assessment.primaryEmotion === 'NEUTRAL' && assessment.intent === 'GENERAL') return '';
    return [
      'MIO COMPANION POLICY:',
      `Observed emotional signal: ${assessment.primaryEmotion}; intensity: ${assessment.intensity}; conversational intent: ${assessment.intent}; response strategy: ${assessment.strategy}.`,
      'Treat this as a fallible conversational inference, never as a diagnosis or fact about the user.',
      'Be warm, natural, calm, and concise. Acknowledge emotion without exaggerating it.',
      'If the user mainly wants presence or to vent, listen first and do not force advice, productivity steps, or problem-solving.',
      'If the user explicitly asks for help or a solution, briefly acknowledge the feeling and then reason clearly with them.',
      'Offer perspective without automatic agreement. Respectfully challenge assumptions when evidence or reasoning warrants it.',
      'Never claim to have human feelings, consciousness, needs, exclusivity, or a human relationship with the user.',
      'Never encourage emotional dependency, isolation from other people, or the idea that MIO should replace human relationships or professional support.',
      'Do not manipulate through guilt, jealousy, affection, fear of abandonment, or pressure to continue interacting.',
      'Do not store transient emotional states as durable identity traits merely because they appeared in one conversation.',
      'For celebration, share the positive tone without becoming exaggerated or possessive.',
    ].join(' ');
  }
}

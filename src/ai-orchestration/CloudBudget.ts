// MIO-PRV-02 (ADR-001, owner decision D-1a): paid cloud inference is off until the owner sets an
// explicit monthly budget. Local models always run; free cloud tiers run within their own quota.
import type { StorageProvider } from '../storage/StorageProvider';
import type { ModelRequest, ModelRouterConfig, ModelUsage } from '../types/models';
import { AICostLedger, type AIBudgetSnapshot } from './AICostLedger';

export type CloudCostClass = 'LOCAL' | 'FREE_CLOUD' | 'PAID_CLOUD';

const LOCAL_PROVIDERS = new Set(['local_heuristic', 'ollama', 'mio_local']);
const OPENROUTER_FREE_ROUTER = 'openrouter/free';

/**
 * Classifies the configured route by who pays for it. An unset cloud model counts as PAID because the
 * server may pick any model from its environment. OpenRouter's web-search plugin can bill credits even
 * on free models, so web search makes an OpenRouter route PAID.
 */
export function classifyModelCost(config: Pick<ModelRouterConfig, 'provider'> & Partial<Pick<ModelRouterConfig, 'model' | 'enableWebSearch'>>): CloudCostClass {
  if (LOCAL_PROVIDERS.has(config.provider)) return 'LOCAL';
  const model = config.model?.trim().toLowerCase();
  if (config.provider === 'openrouter' && model && (model === OPENROUTER_FREE_ROUTER || model.endsWith(':free')) && !config.enableWebSearch) return 'FREE_CLOUD';
  return 'PAID_CLOUD';
}

/**
 * Conservative price ceilings (USD per million tokens) used for every paid route. They deliberately
 * overestimate so the budget runs out early rather than late; they are not billing data.
 */
export const CLOUD_PRICE_CEILING = { inputPerMillionUsd: 10, outputPerMillionUsd: 40 } as const;
export const DEFAULT_ESTIMATED_OUTPUT_TOKENS = 4096;
export const MAX_MONTHLY_CLOUD_BUDGET_USD = 1000;

const tokensFromChars = (chars: number): number => Math.ceil(chars / 4);
const priceUsd = (inputTokens: number, outputTokens: number): number =>
  (inputTokens * CLOUD_PRICE_CEILING.inputPerMillionUsd + outputTokens * CLOUD_PRICE_CEILING.outputPerMillionUsd) / 1_000_000;

export function estimateCloudCallUsd(request: ModelRequest): number {
  const contextChars = (request.applicationContext?.sources ?? []).reduce((sum, source) => sum + source.text.length, 0)
    + (request.memoryContext?.sources ?? []).reduce((sum, source) => sum + source.content.length, 0);
  const promptChars = request.messages.reduce((sum, message) => sum + message.content.length, 0) + contextChars;
  const outputTokens = typeof request.maxOutputTokens === 'number' && request.maxOutputTokens > 0 ? request.maxOutputTokens : DEFAULT_ESTIMATED_OUTPUT_TOKENS;
  return priceUsd(tokensFromChars(promptChars), outputTokens);
}

/** Uses reported token usage when present; otherwise keeps the conservative estimate. */
export function actualCloudCallUsd(usage: ModelUsage | undefined, estimateUsd: number): number {
  if (!usage || (usage.inputTokens === undefined && usage.outputTokens === undefined)) return estimateUsd;
  return priceUsd(Math.max(0, usage.inputTokens ?? 0), Math.max(0, usage.outputTokens ?? 0));
}

export const normalizeMonthlyCloudBudget = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(MAX_MONTHLY_CLOUD_BUDGET_USD, Math.round(value * 100) / 100) : 0;

export interface CloudBudgetSnapshot extends AIBudgetSnapshot { month: string; }
export interface CloudReservation { id: string; month: string; estimatedUsd: number; }

interface StoredSpend { month: string; spentUsd: number; }
const STORAGE_KEY = 'cloud-spend-v1';
const monthOf = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 7);

/** Persistent per-month ledger of estimated paid-cloud spend. Spend resets at the start of each UTC month. */
export class CloudBudgetLedger {
  private month: string | null = null;
  private spentUsd = 0;
  private reservations = new Map<string, CloudReservation>();
  private loading: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private sequence = 0;
  private generation = 0;

  constructor(private storage: StorageProvider | null, private readonly now: () => number = () => Date.now()) {}

  setStorage(storage: StorageProvider | null): void {
    // A load already in flight belongs to the previous storage: bump the generation so its result is
    // discarded, and force a reload from the new storage. In-flight reservations are kept so the spend of
    // calls that are still running is not lost.
    this.generation += 1;
    this.storage = storage;
    this.month = null;
    this.spentUsd = 0;
    this.loading = null;
  }

  private async ensureCurrentMonth(): Promise<string> {
    const current = monthOf(this.now());
    while (this.month !== current) {
      if (!this.loading) {
        const generation = this.generation;
        const storage = this.storage;
        const load = (async () => {
          const stored = storage ? await storage.get<StoredSpend>('settings', STORAGE_KEY).catch(() => null) : null;
          if (generation !== this.generation) return; // storage changed while loading: ignore this result
          const valid = stored && typeof stored.month === 'string' && typeof stored.spentUsd === 'number' && Number.isFinite(stored.spentUsd) && stored.spentUsd >= 0;
          this.spentUsd = valid && stored.month === current ? stored.spentUsd : 0;
          for (const [id, reservation] of this.reservations) if (reservation.month !== current) this.reservations.delete(id);
          this.month = current;
        })();
        const pending: Promise<void> = load.finally(() => { if (this.loading === pending) this.loading = null; });
        this.loading = pending;
      }
      await this.loading;
    }
    return current;
  }

  private ledger(budgetUsd: number): AICostLedger {
    const ledger = new AICostLedger(normalizeMonthlyCloudBudget(budgetUsd), this.spentUsd);
    for (const reservation of this.reservations.values()) ledger.reserve(Math.min(reservation.estimatedUsd, ledger.snapshot().remainingUsd));
    return ledger;
  }

  async snapshot(budgetUsd: number): Promise<CloudBudgetSnapshot> {
    const month = await this.ensureCurrentMonth();
    return { month, ...this.ledger(budgetUsd).snapshot() };
  }

  /** Reserves the estimate against the monthly budget, or throws if it does not fit. */
  async reserve(budgetUsd: number, estimatedUsd: number): Promise<CloudReservation> {
    const month = await this.ensureCurrentMonth();
    this.ledger(budgetUsd).reserve(estimatedUsd);
    const reservation = { id: `cloud_${++this.sequence}`, month, estimatedUsd };
    this.reservations.set(reservation.id, reservation);
    return reservation;
  }

  release(reservation: CloudReservation): void {
    this.reservations.delete(reservation.id);
  }

  /** Records spend for a reservation. Spend is always kept, even when it exceeds the budget. */
  async settle(reservation: CloudReservation, actualUsd: number): Promise<void> {
    if (!this.reservations.delete(reservation.id)) return;
    const month = await this.ensureCurrentMonth();
    // A call that straddles a month boundary is not charged to the new month.
    if (month !== reservation.month) return;
    this.spentUsd += Math.max(0, Number.isFinite(actualUsd) ? actualUsd : reservation.estimatedUsd);
    const snapshot: StoredSpend = { month, spentUsd: this.spentUsd };
    const storage = this.storage;
    if (storage) {
      this.writes = this.writes.catch(() => undefined).then(() => storage.set('settings', STORAGE_KEY, snapshot));
      await this.writes;
    }
  }
}

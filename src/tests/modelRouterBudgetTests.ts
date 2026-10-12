import { ModelRouter } from '../agents/ModelRouter';
import { AICostLedger } from '../ai-orchestration/AICostLedger';
import { CloudBudgetLedger, actualCloudCallUsd, classifyModelCost, estimateCloudCallUsd, normalizeMonthlyCloudBudget } from '../ai-orchestration/CloudBudget';
import { eventBus } from '../core/EventBus';
import { PermissionEngine } from '../security/PermissionEngine';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { DryRunRequest } from '../types/security';

const assert = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const prompt = { messages: [{ role: 'user' as const, content: 'Hello MIO' }] };

// MIO-PRV-02 (ADR-001): paid-cloud budget (D-1a), local-only fallback (D-2a), circuit breaker, provenance.
export async function runModelRouterBudgetTests(): Promise<{ passed: number; total: number }> {
  const originalFetch = globalThis.fetch;
  let posts: string[] = [];
  let prompts = 0;
  let mode: 'ok' | 'fail' = 'ok';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!init?.method || init.method === 'GET') return new Response(JSON.stringify({ ready: true, detail: 'ready' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    posts.push(`${url} ${String(init.body ?? '')}`);
    if (mode === 'fail') return new Response(JSON.stringify({ error: 'upstream down' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    const requested = (JSON.parse(String(init.body ?? '{}')) as { provider?: string }).provider ?? 'openai';
    return new Response(JSON.stringify({ provider: requested, model: 'gpt-test', text: 'cloud answer', source: 'CLOUD_PROXY', usage: { inputTokens: 1000, outputTokens: 500 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const stopApprovals = eventBus.on<DryRunRequest>('REQUEST_DRY_RUN_PERMISSION', request => { prompts++; request.onApprove(); });
  const configure = (budget: number, extra: Record<string, unknown> = {}) => {
    ModelRouter.configure({ provider: 'openai', model: 'gpt-test', proxyEndpoint: '/api/ai/generate', allowOfflineFallback: true, enableWebSearch: false, monthlyCloudBudgetUsd: budget, ...extra });
  };
  const reset = () => { posts = []; prompts = 0; mode = 'ok'; PermissionEngine.clearForTests(); ModelRouter.resetResilienceState(); ModelRouter.setCostStorage(null); };

  const tests: Array<[string, () => Promise<void>]> = [
    ['cost classes: local always, OpenRouter free models free, everything else paid', async () => {
      assert(classifyModelCost({ provider: 'ollama' }) === 'LOCAL' && classifyModelCost({ provider: 'mio_local', enableWebSearch: true }) === 'LOCAL', 'local misclassified');
      assert(classifyModelCost({ provider: 'openrouter', model: 'openrouter/free' }) === 'FREE_CLOUD' && classifyModelCost({ provider: 'openrouter', model: 'meta/llama:free' }) === 'FREE_CLOUD', 'free OpenRouter misclassified');
      assert(classifyModelCost({ provider: 'openrouter', model: 'openrouter/free', enableWebSearch: true }) === 'PAID_CLOUD', 'OpenRouter web search can bill credits');
      assert(classifyModelCost({ provider: 'openrouter' }) === 'PAID_CLOUD' && classifyModelCost({ provider: 'gemini', model: 'x' }) === 'PAID_CLOUD', 'unset or paid model must be PAID');
    }],
    ['budget values are normalized and estimates are conservative', async () => {
      assert(normalizeMonthlyCloudBudget(-5) === 0 && normalizeMonthlyCloudBudget('5') === 0 && normalizeMonthlyCloudBudget(Number.NaN) === 0 && normalizeMonthlyCloudBudget(5000) === 1000 && normalizeMonthlyCloudBudget(2.345) === 2.35, 'budget normalization');
      const estimate = estimateCloudCallUsd({ messages: [{ role: 'user', content: 'x'.repeat(4000) }], maxOutputTokens: 1000 });
      assert(Math.abs(estimate - (1000 * 10 + 1000 * 40) / 1_000_000) < 1e-12, 'estimate formula');
      assert(actualCloudCallUsd(undefined, 0.5) === 0.5 && actualCloudCallUsd({ inputTokens: 1_000_000, outputTokens: 0 }, 0.5) === 10, 'actual cost uses reported usage');
    }],
    ['spend past the limit is recorded, never lost', async () => {
      const ledger = new AICostLedger(1, 0.5);
      ledger.reserve(0.4);
      assert(ledger.settle(0.4, 0.9).exceededLimit && Math.abs(ledger.snapshot().spentUsd - 1.4) < 1e-12, 'overshoot not recorded');
    }],
    ['monthly ledger persists, blocks over-budget reservations, and resets each month', async () => {
      const storage = new InMemoryStorageProvider();
      let now = Date.UTC(2026, 9, 11);
      const ledger = new CloudBudgetLedger(storage, () => now);
      const reservation = await ledger.reserve(1, 0.6);
      let blocked = false; try { await ledger.reserve(1, 0.6); } catch { blocked = true; }
      assert(blocked, 'second reservation should not fit while the first is pending');
      await ledger.settle(reservation, 0.7);
      const reloaded = new CloudBudgetLedger(storage, () => now);
      assert(Math.abs((await reloaded.snapshot(1)).spentUsd - 0.7) < 1e-12, 'spend not persisted');
      now = Date.UTC(2026, 10, 1);
      const nextMonth = await reloaded.snapshot(1);
      assert(nextMonth.month === '2026-11' && nextMonth.spentUsd === 0, 'spend did not reset for the new month');
    }],
    ['$0 budget: paid cloud is never contacted or prompted; falls back to local (D-1a, D-2a)', async () => {
      reset(); ModelRouter.setNetworkState('ONLINE'); configure(0);
      const response = await ModelRouter.generate(prompt, 2000);
      assert(response.provider === 'local_heuristic' && posts.length === 0 && prompts === 0, `paid cloud ran without budget (posts=${posts.length}, prompts=${prompts})`);
      configure(0, { allowOfflineFallback: false });
      let message = ''; try { await ModelRouter.generate(prompt, 2000); } catch (error) { message = error instanceof Error ? error.message : ''; }
      assert(message.includes('monthly cloud budget is $0') && posts.length === 0, 'without fallback the budget block must surface');
    }],
    ['free OpenRouter model runs with a $0 budget and is not charged', async () => {
      reset(); ModelRouter.setNetworkState('ONLINE');
      ModelRouter.configure({ provider: 'openrouter', model: 'openrouter/free', proxyEndpoint: '/api/ai/generate', allowOfflineFallback: false, enableWebSearch: false, monthlyCloudBudgetUsd: 0 });
      const response = await ModelRouter.generate(prompt, 2000);
      assert(response.text === 'cloud answer' && posts.length === 1 && prompts === 1, 'free cloud should run, still behind the data-egress permission');
      assert((await ModelRouter.getCloudBudget()).spentUsd === 0, 'free model was charged');
    }],
    ['budgeted paid call settles reported usage and records secret-free provenance', async () => {
      reset(); ModelRouter.setNetworkState('ONLINE'); configure(5);
      const response = await ModelRouter.generate(prompt, 2000);
      const budget = await ModelRouter.getCloudBudget();
      assert(response.text === 'cloud answer' && posts.length === 1 && Math.abs(budget.spentUsd - (1000 * 10 + 500 * 40) / 1_000_000) < 1e-12 && budget.reservedUsd === 0, `spend not settled from usage (${budget.spentUsd})`);
      const receipt = ModelRouter.getRecentProvenance().at(-1);
      assert(receipt?.status === 'SUCCEEDED' && receipt.locality === 'REMOTE' && receipt.providerId === 'openai' && receipt.actualCostUsd !== undefined, 'provenance missing');
      assert(!/api.?key|bearer|secret|authorization/i.test(JSON.stringify(ModelRouter.getRecentProvenance())), 'provenance leaks secrets');
    }],
    ['exhausted budget falls back locally before any prompt', async () => {
      reset(); ModelRouter.setNetworkState('ONLINE'); configure(0.01);
      const response = await ModelRouter.generate({ ...prompt, maxOutputTokens: 8192 }, 2000);
      assert(response.provider === 'local_heuristic' && posts.length === 0 && prompts === 0, 'estimate above remaining budget must not reach the provider');
    }],
    ['provider failures release the reservation, open the circuit, and never try another cloud (D-2a)', async () => {
      reset(); ModelRouter.setNetworkState('ONLINE'); configure(5); mode = 'fail';
      for (let attempt = 0; attempt < 3; attempt++) {
        const fallback = await ModelRouter.generate(prompt, 2000);
        assert(fallback.provider === 'local_heuristic', 'failed cloud call should fall back locally');
      }
      assert(posts.length === 3 && posts.every(post => post.includes('"provider":"openai"')), 'fallback contacted a cloud provider the user did not select');
      const budget = await ModelRouter.getCloudBudget();
      assert(budget.spentUsd === 0 && budget.reservedUsd === 0, 'failed calls were charged or left reservations');
      const promptsBefore = prompts;
      await ModelRouter.generate(prompt, 2000);
      assert(posts.length === 3 && prompts === promptsBefore, 'open circuit still contacted or prompted for the failing provider');
      assert(ModelRouter.getRecentProvenance().filter(receipt => receipt.status === 'FAILED').length === 3, 'failures not recorded in provenance');
    }],
  ];

  let passed = 0;
  try {
    for (const [name, run] of tests) { await run(); passed++; console.log(`✓ [PASS] ${name}`); }
  } finally {
    stopApprovals();
    globalThis.fetch = originalFetch;
    reset();
    ModelRouter.configure({ provider: 'local_heuristic', allowOfflineFallback: true, enableWebSearch: false, monthlyCloudBudgetUsd: 0 });
    ModelRouter.setNetworkState('OFFLINE');
  }
  return { passed, total: tests.length };
}

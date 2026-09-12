import { safeStorage } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DatabaseService, ProviderConnectionRecord } from './DatabaseService';

const execFileAsync = promisify(execFile);
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_PROMPT_CHARS = 120_000;
const MAX_RESPONSE_CHARS = 2_000_000;

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'claude_cli' | 'gemini_cli' | 'ollama_cli';
export interface ProviderPublicConfig extends ProviderConnectionRecord { hasSecret: boolean; }
export interface ProviderSaveInput { provider: ProviderId; mode: 'api' | 'cli'; model: string; endpoint?: string; executable?: string; apiKey?: string; enabled?: boolean; }
export interface ProviderResult { success: boolean; provider: ProviderId; text?: string; error?: string; latencyMs?: number; }

function cleanError(err: unknown): string { return err instanceof Error ? err.message.replace(/[\r\n]+/g, ' ').slice(0, 500) : 'Unexpected provider error'; }
function validateProvider(value: unknown): ProviderId {
  const allowed: ProviderId[] = ['openai','anthropic','gemini','ollama','claude_cli','gemini_cli','ollama_cli'];
  if (typeof value !== 'string' || !allowed.includes(value as ProviderId)) throw new Error('Unsupported AI provider');
  return value as ProviderId;
}
function validateModel(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > 200) throw new Error('Model identifier is required');
  if (!/^[a-zA-Z0-9._:\/-]+$/.test(value.trim())) throw new Error('Model identifier contains unsupported characters');
  return value.trim();
}
function validatePrompt(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('Prompt is required');
  if (value.length > MAX_PROMPT_CHARS) throw new Error('Prompt exceeds safety limit');
  return value;
}
function isLoopbackUrl(raw: string): boolean {
  try { const url = new URL(raw); return ['http:','https:'].includes(url.protocol) && ['127.0.0.1','localhost','::1'].includes(url.hostname); } catch { return false; }
}
async function fetchJson(url: string, init: RequestInit): Promise<any> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal });
    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_CHARS) throw new Error('Provider response exceeds safety limit');
    let data: any = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
    if (!response.ok) throw new Error(String(data?.error?.message || data?.message || `HTTP ${response.status}`).slice(0, 500));
    return data;
  } finally { clearTimeout(timer); }
}

export class ProviderService {
  constructor(private readonly database: DatabaseService) {}

  private assertSecureSecretStorage() {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('OS-backed encryption is unavailable; API key was not saved');
    const backend = process.platform === 'linux' ? (safeStorage as any).getSelectedStorageBackend?.() : undefined;
    if (backend === 'basic_text') throw new Error('Secure Linux keyring is unavailable; refusing to store API keys using basic_text backend');
  }
  private encryptSecret(secret: string): string { this.assertSecureSecretStorage(); return safeStorage.encryptString(secret).toString('base64'); }
  private decryptSecret(provider: string): string | null {
    const encrypted = this.database.getProtectedSecret(provider); if (!encrypted) return null;
    this.assertSecureSecretStorage(); return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }

  public list(): ProviderPublicConfig[] { return this.database.listProviderConnections().map((record) => ({ ...record, hasSecret: this.database.hasProtectedSecret(record.provider) })); }

  public save(input: ProviderSaveInput): ProviderPublicConfig {
    const provider = validateProvider(input.provider); const mode = input.mode === 'cli' ? 'cli' : 'api'; const model = validateModel(input.model);
    if (provider.endsWith('_cli') && mode !== 'cli') throw new Error('CLI provider must use CLI mode');
    if (!provider.endsWith('_cli') && mode === 'cli') throw new Error('Select a supported CLI provider');

    let endpoint: string | null = null; let executable: string | null = null;
    if (provider === 'ollama') { endpoint = (input.endpoint || 'http://127.0.0.1:11434').replace(/\/$/, ''); if (!isLoopbackUrl(endpoint)) throw new Error('Ollama endpoint must be loopback-only'); }
    else if (mode === 'api' && input.endpoint) throw new Error('Custom remote endpoints are blocked for cloud providers');
    if (mode === 'cli') {
      const defaults: Record<string,string> = { claude_cli:'claude', gemini_cli:'gemini', ollama_cli:'ollama' };
      executable = (input.executable || defaults[provider] || '').trim();
      const allowed = new Set(['claude','claude.exe','gemini','gemini.cmd','gemini.exe','ollama','ollama.exe']);
      if (!allowed.has(executable.toLowerCase())) throw new Error('CLI executable is not allowlisted');
    }

    let encryptedSecret: string | null = null;
    if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
      if (mode !== 'api' || provider === 'ollama') throw new Error('This provider does not accept a stored API key');
      encryptedSecret = this.encryptSecret(input.apiKey.trim());
    }

    const existing = this.database.getProviderConnection(provider);
    const record: ProviderConnectionRecord = { provider, mode, model, endpoint, executable, enabled: input.enabled !== false, lastTestAt: existing?.lastTestAt ?? null, lastStatus: existing?.lastStatus ?? 'untested', lastError: existing?.lastError ?? null };
    this.database.saveProviderConnection(record);
    if (encryptedSecret) this.database.setProtectedSecret(provider, encryptedSecret);
    this.database.appendAudit('AI_PROVIDER','SAVE_CONNECTION',`Saved ${provider} (${mode}) connection metadata`,false);
    return { ...record, hasSecret: this.database.hasProtectedSecret(provider) };
  }

  public remove(providerValue: unknown) { const provider = validateProvider(providerValue); this.database.deleteProviderConnection(provider); this.database.appendAudit('AI_PROVIDER','REMOVE_CONNECTION',`Removed ${provider} connection`,false); }

  public async test(providerValue: unknown): Promise<ProviderResult> {
    const provider = validateProvider(providerValue); const started = Date.now();
    try {
      const result = await this.generate(provider,'Reply with exactly: MIO_CONNECTION_OK',true);
      const ok = result.success && Boolean(result.text?.toUpperCase().includes('MIO_CONNECTION_OK'));
      this.database.updateProviderTestStatus(provider,ok,ok?undefined:(result.error || 'Unexpected test response'));
      this.database.appendAudit('AI_PROVIDER','TEST_CONNECTION',`${provider} test ${ok?'passed':'failed'}`,!ok);
      return { ...result, success: ok, latencyMs: Date.now()-started, error: ok?undefined:(result.error || 'Unexpected provider response') };
    } catch (err) {
      const error = cleanError(err); this.database.updateProviderTestStatus(provider,false,error); this.database.appendAudit('AI_PROVIDER','TEST_CONNECTION',`${provider} test failed: ${error}`,true);
      return { success:false, provider, error, latencyMs:Date.now()-started };
    }
  }

  public async generate(providerValue: unknown, promptValue: unknown, connectionTest = false): Promise<ProviderResult> {
    const provider = validateProvider(providerValue); const prompt = validatePrompt(promptValue); const config = this.database.getProviderConnection(provider);
    if (!config || !config.enabled) return { success:false, provider, error:'Provider is not configured or is disabled' };
    const started = Date.now();
    try {
      let text = '';
      if (provider==='openai') text = await this.callOpenAI(config,prompt);
      else if (provider==='anthropic') text = await this.callAnthropic(config,prompt);
      else if (provider==='gemini') text = await this.callGemini(config,prompt);
      else if (provider==='ollama') text = await this.callOllama(config,prompt);
      else text = await this.callCli(provider,config,prompt);
      if (!connectionTest) this.database.appendAudit('AI_PROVIDER','INFERENCE',`${provider} inference completed (${text.length} chars)`,false);
      return { success:true, provider, text:text.slice(0,MAX_RESPONSE_CHARS), latencyMs:Date.now()-started };
    } catch (err) {
      const error = cleanError(err); if (!connectionTest) this.database.appendAudit('AI_PROVIDER','INFERENCE',`${provider} inference failed: ${error}`,true);
      return { success:false, provider, error, latencyMs:Date.now()-started };
    }
  }

  private requireSecret(provider: string): string { const secret = this.decryptSecret(provider); if (!secret) throw new Error(`API key for ${provider} is not configured`); return secret; }
  private async callOpenAI(config: ProviderConnectionRecord,prompt:string): Promise<string> {
    const data = await fetchJson('https://api.openai.com/v1/responses',{ method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${this.requireSecret('openai')}`}, body:JSON.stringify({model:config.model,input:prompt,max_output_tokens:1200}) });
    const direct = typeof data?.output_text==='string'?data.output_text:''; if (direct) return direct;
    const chunks = Array.isArray(data?.output)?data.output.flatMap((item:any)=>Array.isArray(item?.content)?item.content:[]).map((c:any)=>c?.text).filter(Boolean):[];
    if (!chunks.length) throw new Error('OpenAI returned no text output'); return chunks.join('\n');
  }
  private async callAnthropic(config: ProviderConnectionRecord,prompt:string): Promise<string> {
    const data = await fetchJson('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':this.requireSecret('anthropic'),'anthropic-version':'2023-06-01'},body:JSON.stringify({model:config.model,max_tokens:1200,messages:[{role:'user',content:prompt}]})});
    const text = Array.isArray(data?.content)?data.content.filter((x:any)=>x?.type==='text').map((x:any)=>x.text).join('\n'):''; if (!text) throw new Error('Anthropic returned no text output'); return text;
  }
  private async callGemini(config: ProviderConnectionRecord,prompt:string): Promise<string> {
    const model = encodeURIComponent(config.model);
    const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':this.requireSecret('gemini')},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});
    const text = data?.candidates?.[0]?.content?.parts?.map((part:any)=>part?.text).filter(Boolean).join('\n') || ''; if (!text) throw new Error('Gemini returned no text output'); return text;
  }
  private async callOllama(config: ProviderConnectionRecord,prompt:string): Promise<string> {
    const endpoint=(config.endpoint||'http://127.0.0.1:11434').replace(/\/$/,''); if (!isLoopbackUrl(endpoint)) throw new Error('Ollama endpoint is not loopback-only');
    const data=await fetchJson(`${endpoint}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:config.model,stream:false,messages:[{role:'user',content:prompt}]})});
    const text=String(data?.message?.content||''); if(!text) throw new Error('Ollama returned no text output'); return text;
  }
  private async callCli(provider: ProviderId,config: ProviderConnectionRecord,prompt:string): Promise<string> {
    const executable=config.executable||''; let args:string[];
    if(provider==='claude_cli') args=['--print',prompt]; else if(provider==='gemini_cli') args=['-p',prompt,'--output-format','text']; else if(provider==='ollama_cli') args=['run',config.model,prompt]; else throw new Error('Unsupported CLI provider');
    const {stdout,stderr}=await execFileAsync(executable,args,{timeout:REQUEST_TIMEOUT_MS,maxBuffer:MAX_RESPONSE_CHARS,windowsHide:true,shell:false,env:{...process.env,NO_COLOR:'1'}});
    if(stderr&&!stdout) throw new Error(stderr.slice(0,500)); const text=String(stdout||'').trim(); if(!text) throw new Error('CLI returned no output'); return text;
  }
}

import { createDesktopCapabilityRegistry } from '../../security/CapabilityRegistry';
import { SecureServiceGateway } from '../../services/SecureServiceGateway';
import type { CapabilityExecutionContext } from '../../types/capabilities';

export interface DesktopBrowserReadInput {
  url: string;
}

export interface DesktopBrowserReadOutput {
  title: string;
  url: string;
  text: string;
  truncated: boolean;
  trust: 'UNTRUSTED_EXTERNAL';
}

export interface DesktopBrowserBridge {
  browserReadPage: (request: DesktopBrowserReadInput) => Promise<{
    success: boolean;
    title?: string;
    url?: string;
    text?: string;
    truncated?: boolean;
    error?: string;
  }>;
}

const MAX_URL_LENGTH = 2048;
const MAX_TEXT_CHARS = 60_000;

function normalizedHttpsOrigin(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || raw.length > MAX_URL_LENGTH) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function validBrowserReadInput(input: unknown): input is DesktopBrowserReadInput {
  if (!input || typeof input !== 'object') return false;
  const value = input as Partial<DesktopBrowserReadInput>;
  return typeof value.url === 'string' && Boolean(normalizedHttpsOrigin(value.url));
}

function scopeMatchesBrowserInput(input: DesktopBrowserReadInput, context: CapabilityExecutionContext): boolean {
  const origin = normalizedHttpsOrigin(input.url);
  return Boolean(origin)
    && context.networkOrigin === origin
    && context.resourceId === `browser-origin:${origin}`;
}

export function getDesktopBrowserBridge(): DesktopBrowserBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { mioDesktop?: DesktopBrowserBridge }).mioDesktop;
}

export function createDesktopBrowserGateway(bridge: DesktopBrowserBridge): SecureServiceGateway {
  const gateway = new SecureServiceGateway(createDesktopCapabilityRegistry());
  gateway.register<DesktopBrowserReadInput, DesktopBrowserReadOutput>({
    id: 'service.desktop.browser.read-page',
    validateInput: validBrowserReadInput,
    validateScope: scopeMatchesBrowserInput,
    execute: async (input) => {
      const result = await bridge.browserReadPage(input);
      if (!result.success || typeof result.url !== 'string' || typeof result.text !== 'string') {
        throw new Error(result.error ?? 'Desktop browser page read failed');
      }
      const requestedOrigin = normalizedHttpsOrigin(input.url);
      const returnedOrigin = normalizedHttpsOrigin(result.url);
      if (!requestedOrigin || !returnedOrigin) throw new Error('Desktop browser returned an invalid URL');
      const text = result.text.slice(0, MAX_TEXT_CHARS);
      return {
        title: String(result.title ?? '').slice(0, 512),
        url: result.url.slice(0, MAX_URL_LENGTH),
        text,
        truncated: result.truncated === true || result.text.length > text.length,
        trust: 'UNTRUSTED_EXTERNAL',
      };
    },
    validateOutput: (output) => output.trust === 'UNTRUSTED_EXTERNAL'
      && typeof output.title === 'string'
      && typeof output.url === 'string'
      && typeof output.text === 'string'
      && output.text.length <= MAX_TEXT_CHARS
      && typeof output.truncated === 'boolean',
  });
  return gateway;
}

export function getRequiredDesktopBrowserBridge(): DesktopBrowserBridge {
  const bridge = getDesktopBrowserBridge();
  if (!bridge) throw new Error('MIO governed desktop browser bridge is unavailable in this runtime');
  return bridge;
}

export function buildDesktopBrowserScope(url: string): Pick<CapabilityExecutionContext, 'resourceId' | 'networkOrigin'> {
  const origin = normalizedHttpsOrigin(url);
  if (!origin) throw new Error('Browser scope requires a valid HTTPS URL');
  return { resourceId: `browser-origin:${origin}`, networkOrigin: origin };
}

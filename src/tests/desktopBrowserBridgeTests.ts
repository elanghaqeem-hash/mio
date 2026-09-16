import { createDefaultCapabilityRegistry } from '../security/CapabilityRegistry';
import { buildDesktopBrowserScope, createDesktopBrowserGateway, DesktopBrowserBridge } from '../platform/desktop/DesktopBrowserGateway';

interface SuiteResult { passed: number; total: number; }

export async function runDesktopBrowserBridgeTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`DesktopBrowserBridge test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const defaultRegistry = createDefaultCapabilityRegistry();
  const unavailable = defaultRegistry.get('service.desktop.browser.read-page');
  check(unavailable?.availability === 'UNAVAILABLE', 'Browser bridge is fail-closed outside an explicitly enabled desktop runtime');

  const desktopRegistry = createDefaultCapabilityRegistry({ desktopBrowserBridge: true });
  const descriptor = desktopRegistry.get('service.desktop.browser.read-page');
  check(
    descriptor?.availability === 'AVAILABLE'
      && descriptor.permissionLevel === 'L4_EXECUTE'
      && descriptor.riskLevel === 'HIGH'
      && descriptor.networkAccess === true,
    'Desktop browser capability is high-risk, L4 permission-gated, and network-scoped',
  );

  const missingOrigin = desktopRegistry.authorize('service.desktop.browser.read-page', {
    taskId: 'browser_missing_origin',
    projectId: 'project-alpha',
    mode: 'RESEARCH',
    requestedBy: 'AGENT',
    resourceId: 'browser-origin:https://example.com',
  });
  check(!missingOrigin.allowed && missingOrigin.reason?.includes('Network-origin') === true, 'Browser capability rejects requests without an explicit network origin');

  const scope = buildDesktopBrowserScope('https://example.com/path?q=1');
  check(scope.networkOrigin === 'https://example.com' && scope.resourceId === 'browser-origin:https://example.com', 'Browser scope is bound to the normalized HTTPS origin');

  let nonHttpsRejected = false;
  try { buildDesktopBrowserScope('http://example.com'); } catch { nonHttpsRejected = true; }
  check(nonHttpsRejected, 'Browser scope helper rejects non-HTTPS targets');

  const bridge: DesktopBrowserBridge = {
    browserReadPage: async () => ({
      success: true,
      title: 'Example',
      url: 'https://example.com/',
      text: 'Example page',
      truncated: false,
    }),
  };
  const gateway = createDesktopBrowserGateway(bridge);
  check(gateway.has('service.desktop.browser.read-page'), 'Desktop browser handler registers only through the secure service gateway');

  const invalidInput = await gateway.execute('service.desktop.browser.read-page', { url: 'file:///etc/passwd' }, {
    taskId: 'browser_invalid_input',
    projectId: 'project-alpha',
    mode: 'RESEARCH',
    requestedBy: 'AGENT',
    resourceId: 'browser-origin:https://example.com',
    networkOrigin: 'https://example.com',
  });
  check(!invalidInput.success && invalidInput.error?.includes('input validation') === true, 'Non-HTTPS browser inputs fail before permission or IPC execution');

  const mismatchedScope = await gateway.execute('service.desktop.browser.read-page', { url: 'https://example.com/page' }, {
    taskId: 'browser_scope_mismatch',
    projectId: 'project-alpha',
    mode: 'RESEARCH',
    requestedBy: 'AGENT',
    resourceId: 'browser-origin:https://other.example',
    networkOrigin: 'https://other.example',
  });
  check(!mismatchedScope.success && mismatchedScope.error?.includes('approved capability scope') === true, 'Browser URL must match the approved origin/resource scope before permission is requested');

  return { passed, total };
}

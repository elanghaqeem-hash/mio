// MIO-PRV-06.01: the named security regression gate (`npm run test:security`).
// Every suite here also runs in the full harness; this gate runs them on their own so a security regression
// is reported as one, by threat. testHarnessIntegrityTests keeps this list registered and covering every threat.
import { runAdapterIntegrityTests } from './adapterIntegrityTests';
import { runAiProxyTests } from './aiProxyTests';
import { runBoundedZipReaderTests } from './boundedZipReaderTests';
import { runCapabilityGatewayTests } from './capabilityGatewayTests';
import { runCapabilityProtocolTests } from './capabilityProtocolTests';
import { runContextBoundaryTests } from './contextBoundaryTests';
import { runCreativePipelineTests } from './creativePipelineTests';
import { runDesktopBrowserBridgeTests } from './desktopBrowserBridgeTests';
import { runDesktopWorkspaceBridgeTests } from './desktopWorkspaceBridgeTests';
import { runLocalInferenceBackendTests } from './localInferenceBackendTests';
import { runMemoryGovernanceTests } from './memoryGovernanceTests';
import { runMioContractTests } from './mioContractTests';
import { runMioLocalBrowserAgentTests } from './mioLocalBrowserAgentTests';
import { runMioVoiceRateLimitGatewayTests } from './mioVoiceRateLimitGatewayTests';
import { runMioVoiceWorkersAiGatewayTests } from './mioVoiceWorkersAiGatewayTests';
import { runModelRouterBudgetTests } from './modelRouterBudgetTests';
import { runMutationRecoveryTests } from './mutationRecoveryTests';
import { runPrivacySecurityHardeningTests } from './privacySecurityHardeningTests';
import { runResearchProxyTests } from './researchProxyTests';
import { runResourceGovernanceTests } from './resourceGovernanceTests';
import { runSafeMutationTests } from './safeMutationTests';
import { runScopedAuthorizationTests } from './scopedAuthorizationTests';
import { runSecurityPermissionCompletionTests } from './securityPermissionCompletionTests';
import { runSecurityRegressionTests } from './securityRegressionTests';
import { runTaskRuntimeTests } from './taskRuntimeTests';
import { runTaskSchedulerTests } from './taskSchedulerTests';
import { runUnifiedContextEngineTests } from './unifiedContextEngineTests';
import { runUnifiedContextPipelineTests } from './unifiedContextPipelineTests';

type SuiteResult = { passed: number; total: number };
export type SecurityThreat = 'PATH_TRAVERSAL' | 'SSRF' | 'SECRET_EXPOSURE' | 'CROSS_PROJECT' | 'RESOURCE_EXHAUSTION' | 'PROMPT_INJECTION' | 'PERMISSION' | 'EMERGENCY_STOP' | 'AUDIT';
export const SECURITY_THREATS: readonly SecurityThreat[] = ['PATH_TRAVERSAL', 'SSRF', 'SECRET_EXPOSURE', 'CROSS_PROJECT', 'RESOURCE_EXHAUSTION', 'PROMPT_INJECTION', 'PERMISSION', 'EMERGENCY_STOP', 'AUDIT'];

export const SECURITY_GATE_SUITES: ReadonlyArray<{ name: string; threats: readonly SecurityThreat[]; run: () => SuiteResult | Promise<SuiteResult> }> = [
  { name: 'runSecurityRegressionTests', threats: SECURITY_THREATS, run: runSecurityRegressionTests },
  { name: 'runDesktopWorkspaceBridgeTests', threats: ['PATH_TRAVERSAL', 'RESOURCE_EXHAUSTION'], run: runDesktopWorkspaceBridgeTests },
  { name: 'runSafeMutationTests', threats: ['PATH_TRAVERSAL'], run: runSafeMutationTests },
  { name: 'runMutationRecoveryTests', threats: ['PATH_TRAVERSAL', 'AUDIT'], run: runMutationRecoveryTests },
  { name: 'runBoundedZipReaderTests', threats: ['PATH_TRAVERSAL', 'RESOURCE_EXHAUSTION'], run: runBoundedZipReaderTests },
  { name: 'runAdapterIntegrityTests', threats: ['PATH_TRAVERSAL', 'RESOURCE_EXHAUSTION'], run: runAdapterIntegrityTests },
  { name: 'runDesktopBrowserBridgeTests', threats: ['SSRF', 'PERMISSION'], run: runDesktopBrowserBridgeTests },
  { name: 'runMioLocalBrowserAgentTests', threats: ['SSRF'], run: runMioLocalBrowserAgentTests },
  { name: 'runLocalInferenceBackendTests', threats: ['SSRF'], run: runLocalInferenceBackendTests },
  { name: 'runResearchProxyTests', threats: ['SSRF', 'SECRET_EXPOSURE'], run: runResearchProxyTests },
  { name: 'runAiProxyTests', threats: ['SECRET_EXPOSURE', 'PROMPT_INJECTION'], run: runAiProxyTests },
  { name: 'runPrivacySecurityHardeningTests', threats: ['SECRET_EXPOSURE', 'PATH_TRAVERSAL'], run: runPrivacySecurityHardeningTests },
  { name: 'runMioContractTests', threats: ['SECRET_EXPOSURE'], run: runMioContractTests },
  { name: 'runMemoryGovernanceTests', threats: ['CROSS_PROJECT', 'PROMPT_INJECTION'], run: runMemoryGovernanceTests },
  { name: 'runUnifiedContextEngineTests', threats: ['CROSS_PROJECT', 'PROMPT_INJECTION'], run: runUnifiedContextEngineTests },
  { name: 'runUnifiedContextPipelineTests', threats: ['CROSS_PROJECT', 'PROMPT_INJECTION'], run: runUnifiedContextPipelineTests },
  { name: 'runContextBoundaryTests', threats: ['PROMPT_INJECTION'], run: runContextBoundaryTests },
  { name: 'runScopedAuthorizationTests', threats: ['PERMISSION', 'CROSS_PROJECT', 'EMERGENCY_STOP'], run: runScopedAuthorizationTests },
  { name: 'runCapabilityGatewayTests', threats: ['PERMISSION'], run: runCapabilityGatewayTests },
  { name: 'runCapabilityProtocolTests', threats: ['PERMISSION', 'SECRET_EXPOSURE', 'RESOURCE_EXHAUSTION', 'EMERGENCY_STOP', 'AUDIT'], run: runCapabilityProtocolTests },
  { name: 'runSecurityPermissionCompletionTests', threats: ['PERMISSION', 'AUDIT'], run: runSecurityPermissionCompletionTests },
  { name: 'runResourceGovernanceTests', threats: ['RESOURCE_EXHAUSTION', 'AUDIT'], run: runResourceGovernanceTests },
  { name: 'runModelRouterBudgetTests', threats: ['RESOURCE_EXHAUSTION', 'PERMISSION'], run: runModelRouterBudgetTests },
  { name: 'runMioVoiceRateLimitGatewayTests', threats: ['RESOURCE_EXHAUSTION'], run: runMioVoiceRateLimitGatewayTests },
  { name: 'runMioVoiceWorkersAiGatewayTests', threats: ['RESOURCE_EXHAUSTION', 'SECRET_EXPOSURE'], run: runMioVoiceWorkersAiGatewayTests },
  { name: 'runTaskRuntimeTests', threats: ['EMERGENCY_STOP'], run: runTaskRuntimeTests },
  { name: 'runTaskSchedulerTests', threats: ['EMERGENCY_STOP', 'RESOURCE_EXHAUSTION'], run: runTaskSchedulerTests },
  { name: 'runCreativePipelineTests', threats: ['EMERGENCY_STOP'], run: runCreativePipelineTests },
];

async function main(): Promise<void> {
  let passed = 0;
  let total = 0;
  for (const suite of SECURITY_GATE_SUITES) {
    const result = await suite.run();
    passed += result.passed;
    total += result.total;
    if (result.passed !== result.total) console.error(`✗ [SECURITY GATE] ${suite.name}: ${result.passed}/${result.total} (${suite.threats.join(', ')})`);
  }
  console.log(`SECURITY REGRESSION GATE: ${passed}/${total} across ${SECURITY_GATE_SUITES.length} suites`);
  if (passed !== total) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('securityGate.ts')) main().catch((error) => { console.error(error); process.exitCode = 1; });

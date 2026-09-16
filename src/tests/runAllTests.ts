import { runMioTestSuite } from './systemTests';
import { runResearchConflictTests } from './researchConflictTests';
import { runToolRouterTests } from './toolRouterTests';
import { runModelRouterTests } from './modelRouterTests';
import { runMioLocalProviderTests } from './mioLocalProviderTests';
import { runMioLocalBrowserAgentTests } from './mioLocalBrowserAgentTests';
import { runLocalInferenceBackendTests } from './localInferenceBackendTests';
import { runTrainingFoundationTests } from './trainingFoundationTests';
import { runTrainingBundleTests } from './trainingBundleTests';
import { runTrainingCandidateRegistryTests } from './trainingCandidateRegistryTests';
import { runTrainingCandidateReviewTests } from './trainingCandidateReviewTests';
import { runModelPromotionTests } from './modelPromotionTests';
import { runPromotedModelActivationTests } from './promotedModelActivationTests';
import { runAiProxyTests } from './aiProxyTests';
import { runResearchProxyTests } from './researchProxyTests';
import { runContextContinuityTests } from './contextContinuityTests';
import { runModelContextAssemblerTests } from './modelContextAssemblerTests';
import { runSystemPreferencesTests } from './systemPreferencesTests';
import { runTaskRuntimeTests } from './taskRuntimeTests';
import { runTaskSchedulerTests } from './taskSchedulerTests';
import { runTaskIntegrityTests } from './taskIntegrityTests';
import { runResourceGovernanceTests } from './resourceGovernanceTests';
import { runScopedAuthorizationTests } from './scopedAuthorizationTests';
import { runCapabilityGatewayTests } from './capabilityGatewayTests';
import { runDesktopWorkspaceBridgeTests } from './desktopWorkspaceBridgeTests';
import { runDesktopBrowserBridgeTests } from './desktopBrowserBridgeTests';
import { runKnowledgeIngestionTests } from './knowledgeIngestionTests';
import { runProjectKnowledgeIndexTests } from './projectKnowledgeIndexTests';
import { runKnowledgeGovernanceWorkflowTests } from './knowledgeGovernanceWorkflowTests';
import { runKnowledgeHealthTests } from './knowledgeHealthTests';
import { runKnowledgeCorroborationTests } from './knowledgeCorroborationTests';
import { runMemoryGovernanceTests } from './memoryGovernanceTests';
import { runKnowledgeLineageDiagnosticsTests } from './knowledgeLineageDiagnosticsTests';
import { runResearchKnowledgePromotionTests } from './researchKnowledgePromotionTests';
import { runResearchRevalidationTests } from './researchRevalidationTests';
import { runKnowledgeReviewInboxTests } from './knowledgeReviewInboxTests';
import { runEvidencePackageTests } from './evidencePackageTests';
import { runCreativePipelineTests } from './creativePipelineTests';
import { runSecurityPermissionCompletionTests } from './securityPermissionCompletionTests';
import { runCreativeDocumentKernelTests } from './creativeDocumentKernelTests';
import { runCreativeStudioIntegrationTests } from './creativeStudioIntegrationTests';
import { runCreative3DAnimationWorkspaceTests } from './creative3DAnimationWorkspaceTests';
import { runCreativeDrawingGraphicWorkspaceTests } from './creativeDrawingGraphicWorkspaceTests';
import { runCreativePhotoWorkspaceTests } from './creativePhotoWorkspaceTests';
import { runCreativeMotion2DWorkspaceTests } from './creativeMotion2DWorkspaceTests';
import { runCreativeAudioWorkspaceTests } from './creativeAudioWorkspaceTests';
import { runCreativeWorkspaceIntegrationTests } from './creativeWorkspaceIntegrationTests';
import { runCreativeEngine18Tests } from './creativeEngine18Tests';

const runners = [
  runMioTestSuite,
  async () => runResearchConflictTests(),
  runToolRouterTests,
  runModelRouterTests,
  runMioLocalProviderTests,
  runMioLocalBrowserAgentTests,
  runLocalInferenceBackendTests,
  runTrainingFoundationTests,
  runTrainingBundleTests,
  runTrainingCandidateRegistryTests,
  runTrainingCandidateReviewTests,
  runModelPromotionTests,
  runPromotedModelActivationTests,
  runAiProxyTests,
  runResearchProxyTests,
  runContextContinuityTests,
  runModelContextAssemblerTests,
  runSystemPreferencesTests,
  runTaskRuntimeTests,
  runTaskSchedulerTests,
  runTaskIntegrityTests,
  runResourceGovernanceTests,
  runScopedAuthorizationTests,
  runCapabilityGatewayTests,
  runDesktopWorkspaceBridgeTests,
  runDesktopBrowserBridgeTests,
  runKnowledgeIngestionTests,
  runProjectKnowledgeIndexTests,
  runKnowledgeGovernanceWorkflowTests,
  runKnowledgeHealthTests,
  runKnowledgeCorroborationTests,
  runMemoryGovernanceTests,
  runKnowledgeLineageDiagnosticsTests,
  runResearchKnowledgePromotionTests,
  runResearchRevalidationTests,
  runKnowledgeReviewInboxTests,
  runEvidencePackageTests,
  runCreativePipelineTests,
  runSecurityPermissionCompletionTests,
  runCreativeDocumentKernelTests,
  runCreativeStudioIntegrationTests,
  runCreative3DAnimationWorkspaceTests,
  runCreativeDrawingGraphicWorkspaceTests,
  runCreativePhotoWorkspaceTests,
  runCreativeMotion2DWorkspaceTests,
  runCreativeAudioWorkspaceTests,
  runCreativeWorkspaceIntegrationTests,
  runCreativeEngine18Tests,
];

async function main(): Promise<void> {
  const results = [];
  for (const run of runners) results.push(await run());
  const passed = results.reduce((sum, result) => sum + result.passed, 0);
  const total = results.reduce((sum, result) => sum + result.total, 0);
  console.log(`TOTAL VALIDATION: ${passed}/${total}`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

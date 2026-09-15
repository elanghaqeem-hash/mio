import { CreativeOrchestrator } from '../agents/CreativeOrchestrator';
import { emergencyStop } from '../core/EmergencyStop';
import { ProjectManager } from '../project/ProjectManager';
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';

interface Result { name: string; passed: boolean; error?: string }
function assert(condition: unknown, message: string): void { if (!condition) throw new Error(message); }
async function test(name: string, fn: () => void | Promise<void>): Promise<Result> { try { await fn(); return { name, passed: true }; } catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; } }

export async function runCreativePipelineTests(): Promise<{ passed: number; total: number }> {
  const results: Result[] = [];
  const storage = new InMemoryStorageProvider();
  ProjectManager.setStorageProvider(storage);
  await ProjectManager.initialize();
  ProjectManager.createProject('Creative Pipeline Test');
  emergencyStop.reset();

  const prompt = 'Create a 3d drone, animate hover, add laser sfx, compose music and design a technical poster';
  const planned = CreativeOrchestrator.planCreativePipeline(prompt);

  results.push(await test('Cross-mode planner creates explicit dependency graph', () => {
    const model = planned.find((step) => step.mode === '3D');
    const animation = planned.find((step) => step.mode === 'ANIMATION');
    const graphic = planned.find((step) => step.mode === 'GRAPHIC');
    assert(Boolean(model && animation && graphic), 'expected 3D, animation and graphic steps');
    assert(animation?.dependsOnStepIds.includes(model!.id), 'animation should depend on 3D when present');
    assert((graphic?.dependsOnStepIds.length ?? 0) >= 4, 'graphic should reference prior pipeline outputs');
  }));

  let executionResult = false;
  results.push(await test('Cross-mode pipeline executes every planned step through structural validation', async () => {
    executionResult = await CreativeOrchestrator.executePipeline(planned, () => undefined, prompt);
    assert(executionResult, 'pipeline should succeed');
    assert(planned.every((step) => step.status === 'completed' && step.validation?.valid === true), 'all steps must complete with valid structural validation');
  }));

  const project = ProjectManager.getProject();
  const pipeline = project.creativePipelines?.[0];
  results.push(await test('Completed creative pipeline persists project-scoped execution record', () => {
    assert(pipeline?.status === 'COMPLETED', 'pipeline record must be completed');
    assert(pipeline?.steps.every((step) => step.status === 'COMPLETED' && Boolean(step.outputAssetId)), 'persisted steps need completed output assets');
  }));

  results.push(await test('Generated creative assets retain pipeline lineage and dependency asset IDs', () => {
    const animationStep = pipeline?.steps.find((step) => step.mode === 'ANIMATION');
    const animationAsset = project.assets.find((asset) => asset.id === animationStep?.outputAssetId);
    assert(Boolean(animationAsset?.data?.__mioPipeline?.pipelineId === pipeline?.id), 'pipeline identity missing from animation asset');
    assert(Array.isArray(animationAsset?.data?.__mioPipeline?.dependsOnAssetIds) && animationAsset.data.__mioPipeline.dependsOnAssetIds.length === 1, 'animation upstream asset dependency missing');
  }));

  results.push(await test('Animation track binds to actual generated 3D object identity', () => {
    const modelStep = pipeline?.steps.find((step) => step.mode === '3D');
    const animationStep = pipeline?.steps.find((step) => step.mode === 'ANIMATION');
    const modelAsset = project.assets.find((asset) => asset.id === modelStep?.outputAssetId);
    const animationAsset = project.assets.find((asset) => asset.id === animationStep?.outputAssetId);
    assert(animationAsset?.data?.tracks?.[0]?.targetObjectId === modelAsset?.data?.objects?.[0]?.id, 'animation target must match upstream generated 3D object');
  }));

  results.push(await test('Pipeline completion is linked to a project version snapshot', () => {
    assert(Boolean(pipeline?.snapshotVersionId), 'snapshot version id missing');
    assert(project.versions.some((version) => version.versionId === pipeline?.snapshotVersionId), 'linked project snapshot not found');
  }));

  results.push(await test('Creative pipeline state survives project storage persistence round-trip', async () => {
    await ProjectManager.flush();
    ProjectManager.setStorageProvider(storage);
    await ProjectManager.initialize();
    const restored = ProjectManager.getProject().creativePipelines?.find((item) => item.id === pipeline?.id);
    assert(restored?.status === 'COMPLETED' && restored.steps.length === planned.length, 'creative pipeline did not survive storage round-trip');
  }));

  results.push(await test('Missing dependency fails closed before downstream asset generation', async () => {
    ProjectManager.createProject('Blocked Creative Pipeline Test');
    const broken = CreativeOrchestrator.planCreativePipeline('3d drone animate hover');
    const animation = broken.find((step) => step.mode === 'ANIMATION');
    if (!animation) throw new Error('animation step missing');
    animation.dependsOnStepIds = ['nonexistent_step'];
    const success = await CreativeOrchestrator.executePipeline(broken, () => undefined, 'broken dependency test');
    const blockedPipeline = ProjectManager.getProject().creativePipelines?.[0];
    assert(!success && blockedPipeline?.status === 'FAILED', 'broken dependency must fail pipeline');
    assert(animation.status === 'blocked', 'downstream step should be blocked');
  }));

  results.push(await test('STOP MIO cancels pipeline before generating creative output', async () => {
    ProjectManager.createProject('Cancelled Creative Pipeline Test');
    const steps = CreativeOrchestrator.planCreativePipeline('3d drone poster');
    emergencyStop.triggerEmergencyStop('creative pipeline test');
    const success = await CreativeOrchestrator.executePipeline(steps, () => undefined, 'cancelled pipeline test');
    assert(!success && ProjectManager.getProject().assets.length === 0, 'STOP MIO must prevent creative asset generation');
    assert(ProjectManager.getProject().creativePipelines?.[0]?.status === 'CANCELLED', 'pipeline cancellation state missing');
    emergencyStop.reset();
  }));

  results.push(await test('Creative pipeline disclosure does not overclaim artistic quality or external-model generation', () => {
    const record = ProjectManager.getProject().creativePipelines?.[0];
    assert(record?.disclosure.includes('does not imply artistic quality or external-model generation') === true, 'truthful creative pipeline disclosure missing');
  }));

  for (const result of results) console.log(`${result.passed ? '✓' : '✗'} [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${result.error ? ` — ${result.error}` : ''}`);
  return { passed: results.filter((item) => item.passed).length, total: results.length };
}

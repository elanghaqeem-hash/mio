import { buildDesktopBrowserScope, createDesktopBrowserGateway, getDesktopBrowserBridge } from '../../platform/desktop/DesktopBrowserGateway';
import { taskRuntime } from '../../orchestrator/TaskRuntime';
import { ModelRequest } from '../../types/models';

export interface MioLocalBrowserEvidence {
  title: string;
  url: string;
  text: string;
  truncated: boolean;
}

const MAX_MODEL_BROWSER_TEXT = 30_000;

export async function executeMioLocalBrowserRead(
  url: string,
  request: ModelRequest,
  signal?: AbortSignal,
): Promise<MioLocalBrowserEvidence> {
  if (signal?.aborted) throw new Error('Browser read cancelled before execution');
  const taskId = typeof request.metadata?.taskId === 'string' ? request.metadata.taskId : undefined;
  const projectId = typeof request.metadata?.projectId === 'string' ? request.metadata.projectId : undefined;
  if (!taskId) throw new Error('Governed browser reading requires a MIO task context');
  const task = taskRuntime.get(taskId);
  if (!task) throw new Error('Governed browser reading requires an active registered MIO task');
  if (task.mode !== 'CHAT' && task.mode !== 'RESEARCH') throw new Error(`Browser reading is unavailable in ${task.mode} mode`);

  const bridge = getDesktopBrowserBridge();
  if (!bridge) throw new Error('Governed desktop browser bridge is unavailable in this runtime');
  const gateway = createDesktopBrowserGateway(bridge);
  const scope = buildDesktopBrowserScope(url);
  const result = await gateway.execute<MioLocalBrowserEvidence>('service.desktop.browser.read-page', { url }, {
    taskId,
    projectId: projectId ?? task.projectId,
    mode: task.mode,
    requestedBy: 'AGENT',
    ...scope,
  });
  if (signal?.aborted) throw new Error('Browser read cancelled after execution');
  if (!result.success || !result.data) throw new Error(result.error ?? 'Governed browser read failed');

  return {
    title: result.data.title,
    url: result.data.url,
    text: result.data.text.slice(0, MAX_MODEL_BROWSER_TEXT),
    truncated: result.data.truncated || result.data.text.length > MAX_MODEL_BROWSER_TEXT,
  };
}

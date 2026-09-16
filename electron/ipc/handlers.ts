import { app, BrowserWindow, dialog, IpcMainInvokeEvent, Notification } from 'electron';
import * as os from 'os';
import { BrowserReadSandbox } from './browserReadSandbox';
import { TrainingHandoffPackager, type PackageTrainingHandoffRequest } from './trainingHandoffPackager';
import { TrainingHandoffReader, type ReadTrainingHandoffRequest } from './trainingHandoffReader';
import { TrainingJobManager, type StartTrainingJobRequest } from './trainingJobManager';
import { WorkspaceSandbox } from './workspaceSandbox';

export interface WorkspacePathRequest {
  workspaceId: string;
  relativePath: string;
}

export interface BrowserReadPageRequest {
  url: string;
}

const MAX_NOTIFICATION_TEXT = 2000;
const MAX_STOP_REASON = 500;
const MAX_WORKSPACE_ID = 128;
const MAX_BROWSER_URL = 2048;
const MAX_TRAINING_JOB_ID = 256;
const MAX_TRAINING_PATH = 4096;

export function setupIpcHandlers(mainWindow: BrowserWindow) {
  const workspaceSandbox = new WorkspaceSandbox();
  const browserReadSandbox = new BrowserReadSandbox();
  const trainingJobManager = new TrainingJobManager(workspaceSandbox);
  const trainingHandoffPackager = new TrainingHandoffPackager(workspaceSandbox, trainingJobManager);
  const trainingHandoffReader = new TrainingHandoffReader(workspaceSandbox, trainingJobManager, trainingHandoffPackager);

  const validateWorkspaceId = (workspaceId: unknown): workspaceId is string => {
    return typeof workspaceId === 'string' && workspaceId.length > 0 && workspaceId.length <= MAX_WORKSPACE_ID && /^ws_[a-zA-Z0-9-]+$/.test(workspaceId);
  };

  const validateWorkspacePathRequest = (request: unknown): request is WorkspacePathRequest => {
    if (!request || typeof request !== 'object') return false;
    const value = request as Partial<WorkspacePathRequest>;
    return validateWorkspaceId(value.workspaceId) && typeof value.relativePath === 'string' && value.relativePath.length <= MAX_TRAINING_PATH;
  };

  const validateBrowserReadRequest = (request: unknown): request is BrowserReadPageRequest => {
    if (!request || typeof request !== 'object') return false;
    const value = request as Partial<BrowserReadPageRequest>;
    return typeof value.url === 'string' && value.url.trim().length > 0 && value.url.length <= MAX_BROWSER_URL;
  };

  const validateTrainingStartRequest = (request: unknown): request is StartTrainingJobRequest => {
    if (!request || typeof request !== 'object') return false;
    const value = request as Partial<StartTrainingJobRequest>;
    return validateWorkspaceId(value.workspaceId)
      && typeof value.bundleRelativePath === 'string'
      && value.bundleRelativePath.length > 0
      && value.bundleRelativePath.length <= MAX_TRAINING_PATH
      && (value.outputRelativePath === undefined || (typeof value.outputRelativePath === 'string' && value.outputRelativePath.length > 0 && value.outputRelativePath.length <= MAX_TRAINING_PATH))
      && (value.pythonRuntime === 'python' || value.pythonRuntime === 'python3' || value.pythonRuntime === 'py')
      && (value.mode === 'DRY_RUN' || value.mode === 'TRAIN')
      && (value.mode !== 'DRY_RUN' || value.outputRelativePath === undefined)
      && (value.mode !== 'TRAIN' || typeof value.outputRelativePath === 'string');
  };

  const validateTrainingJobId = (jobId: unknown): jobId is string => {
    return typeof jobId === 'string' && jobId.length > 0 && jobId.length <= MAX_TRAINING_JOB_ID && /^training-job:[0-9]+:[a-f0-9-]+$/i.test(jobId);
  };

  const validateTrainingHandoffRequest = (request: unknown): request is PackageTrainingHandoffRequest => {
    if (!request || typeof request !== 'object') return false;
    const value = request as Partial<PackageTrainingHandoffRequest>;
    const validPath = (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate.length > 0 && candidate.length <= MAX_TRAINING_PATH && !candidate.includes('\u0000');
    return validateTrainingJobId(value.jobId)
      && validateWorkspaceId(value.workspaceId)
      && validPath(value.bundleRelativePath)
      && validPath(value.resultFileRelativePath)
      && validPath(value.handoffRelativePath);
  };

  const validateTrainingHandoffReadRequest = (request: unknown): request is ReadTrainingHandoffRequest => {
    if (!request || typeof request !== 'object') return false;
    const value = request as Partial<ReadTrainingHandoffRequest>;
    return validateTrainingJobId(value.jobId) && validateWorkspaceId(value.workspaceId);
  };

  return {
    handleMinimize: () => {
      if (mainWindow) mainWindow.minimize();
    },
    handleMaximize: () => {
      if (!mainWindow) return false;
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        return false;
      }
      mainWindow.maximize();
      return true;
    },
    handleClose: () => {
      if (mainWindow) mainWindow.close();
    },
    handleIsMaximized: () => mainWindow ? mainWindow.isMaximized() : false,

    handleGetSystemInfo: () => ({
      platform: process.platform,
      arch: process.arch,
      osVersion: os.release(),
      totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
      freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
      cpuCores: os.cpus().length,
    }),
    handleGetAppVersion: () => app.getVersion(),

    handleShowNotification: (_event: IpcMainInvokeEvent, options: unknown) => {
      if (!options || typeof options !== 'object') return { success: false, error: 'Invalid notification payload' };
      const value = options as { title?: unknown; body?: unknown; silent?: unknown };
      if (typeof value.title !== 'string' || typeof value.body !== 'string') return { success: false, error: 'Notification title/body must be strings' };
      if (value.title.length > MAX_NOTIFICATION_TEXT || value.body.length > MAX_NOTIFICATION_TEXT) return { success: false, error: 'Notification payload exceeds bounded length' };
      if (Notification.isSupported()) {
        new Notification({ title: value.title || 'Mio V2 Notification', body: value.body, silent: value.silent === true }).show();
      }
      return { success: true };
    },

    handleEmergencyStop: (_event: IpcMainInvokeEvent, reason: unknown) => {
      const safeReason = typeof reason === 'string' ? reason.slice(0, MAX_STOP_REASON) : 'Renderer requested STOP MIO';
      console.warn(`[ELECTRON MAIN] Emergency Stop Triggered: ${safeReason}`);
      trainingJobManager.cancelAll();
      if (mainWindow) mainWindow.webContents.send('mio:event:emergencyStop', safeReason);
      return { success: true };
    },

    handleAuthorizeWorkspace: async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Authorize Workspace Directory for Mio',
      });
      if (result.canceled || result.filePaths.length === 0) return { success: false, cancelled: true };
      try {
        const workspace = await workspaceSandbox.authorizeRoot(result.filePaths[0]);
        return { success: true, workspace };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    handleRevokeWorkspace: (_event: IpcMainInvokeEvent, workspaceId: unknown) => {
      if (!validateWorkspaceId(workspaceId)) return { success: false, error: 'Invalid workspace authority id' };
      if (trainingJobManager.hasRunningForWorkspace(workspaceId)) {
        trainingJobManager.cancelWorkspace(workspaceId);
        return { success: false, error: 'Active governed training used this workspace. Cancellation was requested; retry revocation after the job reaches a terminal state.' };
      }
      return { success: workspaceSandbox.revoke(workspaceId) };
    },

    handleReadWorkspaceText: async (_event: IpcMainInvokeEvent, request: unknown) => {
      if (!validateWorkspacePathRequest(request)) return { success: false, error: 'Invalid workspace text-read request' };
      try {
        const result = await workspaceSandbox.readText(request.workspaceId, request.relativePath);
        return { success: true, data: result.data, bytes: result.bytes };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    handleListWorkspace: async (_event: IpcMainInvokeEvent, request: unknown) => {
      if (!validateWorkspacePathRequest(request)) return { success: false, error: 'Invalid workspace directory-list request' };
      try {
        const entries = await workspaceSandbox.listDirectory(request.workspaceId, request.relativePath);
        return { success: true, entries };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    handleHashWorkspaceTree: async (_event: IpcMainInvokeEvent, request: unknown) => {
      if (!validateWorkspacePathRequest(request)) return { success: false, error: 'Invalid workspace tree-hash request' };
      try {
        const result = await workspaceSandbox.hashTree(request.workspaceId, request.relativePath);
        return {
          success: true,
          result: {
            schemaVersion: result.schemaVersion,
            algorithm: result.algorithm,
            canonicalization: result.canonicalization,
            rootRelativePath: result.rootRelativePath,
            fingerprint: result.fingerprint,
            fileCount: result.fileCount,
            totalBytes: result.totalBytes,
            limits: result.limits,
          },
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    handleBrowserReadPage: async (_event: IpcMainInvokeEvent, request: unknown) => {
      if (!validateBrowserReadRequest(request)) return { success: false, error: 'Invalid browser read request' };
      try {
        const result = await browserReadSandbox.read(request);
        return { success: true, ...result };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    handleStartTrainingJob: async (_event: IpcMainInvokeEvent, request: unknown) => {
      if (!validateTrainingStartRequest(request)) return { success: false, error: 'Invalid governed training job request' };
      try {
        return { success: true, job: await trainingJobManager.start(request) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    handleGetTrainingJob: (_event: IpcMainInvokeEvent, jobId: unknown) => {
      if (!validateTrainingJobId(jobId)) return { success: false, error: 'Invalid governed training job id' };
      const job = trainingJobManager.get(jobId);
      return job ? { success: true, job } : { success: false, error: 'Governed training job was not found' };
    },

    handleListTrainingJobs: () => ({ success: true, jobs: trainingJobManager.list(20) }),

    handleCancelTrainingJob: (_event: IpcMainInvokeEvent, jobId: unknown) => {
      if (!validateTrainingJobId(jobId)) return { success: false, error: 'Invalid governed training job id' };
      try {
        return { success: true, job: trainingJobManager.cancel(jobId) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    handlePackageTrainingHandoff: async (_event: IpcMainInvokeEvent, request: unknown) => {
      if (!validateTrainingHandoffRequest(request)) return { success: false, error: 'Invalid governed training handoff packaging request' };
      try {
        return { success: true, receipt: await trainingHandoffPackager.packageJob(request) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    handleGetTrainingHandoffReceipt: (_event: IpcMainInvokeEvent, jobId: unknown) => {
      if (!validateTrainingJobId(jobId)) return { success: false, error: 'Invalid governed training job id' };
      const receipt = trainingHandoffPackager.getReceipt(jobId);
      return receipt ? { success: true, receipt } : { success: false, error: 'No TP-0.63 handoff packaging receipt exists for this job' };
    },

    handleReadTrainingHandoff: async (_event: IpcMainInvokeEvent, request: unknown) => {
      if (!validateTrainingHandoffReadRequest(request)) return { success: false, error: 'Invalid governed training handoff read request' };
      try {
        return { success: true, result: await trainingHandoffReader.read(request) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    cancelAllTrainingJobs: () => trainingJobManager.cancelAll(),

    revokeAllWorkspaceAuthority: () => {
      trainingJobManager.forceStopAll();
      workspaceSandbox.revokeAll();
    },
  };
}

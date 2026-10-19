import { app, BrowserWindow, dialog, IpcMainInvokeEvent, Notification } from 'electron';
import * as os from 'os';
import { BrowserReadSandbox } from './browserReadSandbox';
import { TrainingHandoffPackager, type PackageTrainingHandoffRequest } from './trainingHandoffPackager';
import { TrainingHandoffReader, type ReadTrainingHandoffRequest } from './trainingHandoffReader';
import { TrainingJobManager, type StartTrainingJobRequest } from './trainingJobManager';
import { WorkspaceSandbox } from './workspaceSandbox';
import { readBoundedZipEntries } from './boundedZipReader';
import { type DesktopMutationTransaction } from './mutationApproval';
import { MutationApprovalStore } from './mutationApprovalStore';
import { DesktopMutationJournalStore } from './mutationJournalStore';
import { DesktopDurableMutationCheckpoints } from './durableMutationCheckpoints';
import { DesktopWorkspaceMutationLease } from './workspaceMutationLease';
import { DesktopReadOnlyCapabilityBridge } from './readOnlyCapabilityBridge';
import { GovernedDesktopMutationDispatcher } from './governedMutationDispatcher';
import { createTrustedNodeCreativeExecutor, type TrustedNodeCreativeExecutor, type TrustedCreativeCommand } from '../../src/observability/TrustedNodeCreativeExecutor';
import { TrustedCubeSceneAdapter } from '../../src/observability/TrustedCubeSceneAdapter';

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
  const mutationJournal = DesktopMutationJournalStore.atUserData(app.getPath('userData'));
  const durableCheckpoints = new DesktopDurableMutationCheckpoints(app.getPath('userData'));
  const mutationApprovals = new MutationApprovalStore();
  const workspaceMutationLease = new DesktopWorkspaceMutationLease();
  // Sticky STOP: a running operation may finish, but no subsequent file mutation is admitted.
  let desktopMutationStopped = false;
  let creativeRuntime: TrustedNodeCreativeExecutor | undefined;
  let cubeApprovalPending = false;
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

  const isAuthorizedWorkspace = (workspaceId: string): boolean => workspaceSandbox.listAuthorized().some(item => item.id === workspaceId);

  const desktopReadCapabilities = new DesktopReadOnlyCapabilityBridge({
    authorized: isAuthorizedWorkspace,
    stopped: () => desktopMutationStopped,
    list: (workspaceId, relativePath) => workspaceSandbox.listDirectory(workspaceId, relativePath),
    readText: (workspaceId, relativePath) => workspaceSandbox.readText(workspaceId, relativePath),
    inspectRecovery: workspaceId => durableCheckpoints.inspectRecovery(workspaceId),
  });

  const handleExecuteMutation = async (request: unknown) => {
      if (!request || typeof request !== 'object') return { success: false, error: 'Invalid mutation request' };
      const value=request as {transaction?:DesktopMutationTransaction;approvalToken?:unknown};
      if (!value.transaction || typeof value.approvalToken!=='string' || !validateWorkspaceId(value.transaction.workspaceId)) return {success:false,error:'Invalid mutation transaction/approval envelope'};
      if (!isAuthorizedWorkspace(value.transaction.workspaceId)) return {success:false,error:'Workspace authorization required'};
      if (desktopMutationStopped) return {success:false,error:'MUTATION_STOP_LATCHED'};
      // Acquire synchronously before any async mutation. Reject overlap rather than queueing.
      let releaseWorkspace: () => void;
      try { releaseWorkspace = workspaceMutationLease.acquire(value.transaction.workspaceId); }
      catch { return { success: false, error: 'WORKSPACE_MUTATION_ALREADY_ACTIVE' }; }
      try {
        mutationApprovals.consume(value.transaction,value.approvalToken);
        const transaction = value.transaction;
        // Reserve the complete transaction before the first side effect. Disk failure rejects execution.
        durableCheckpoints.reserve(transaction.workspaceId, transaction.id, transaction.operations.map(operation => operation.id));
        const completedOperationIds: string[] = [];
        mutationJournal.append({ transactionId: transaction.id, workspaceId: transaction.workspaceId, state: 'STARTED' });
        for (const operation of transaction.operations) {
          if (desktopMutationStopped) {
            try { mutationJournal.append({ transactionId: transaction.id, workspaceId: transaction.workspaceId, state: 'FAILED', error: 'STOP_MIO' }); } catch { /* keep checkpoints for manual review */ }
            return {success:false,receipt:{transactionId:transaction.id,workspaceId:transaction.workspaceId,state:'STOPPED_PARTIAL',completedOperationIds},error:'STOP_MIO: remaining operations not executed; inspect recovery checkpoints'};
          }
          // Persist EXECUTING before invoking the mutating tool. No tool runs if the write fails.
          durableCheckpoints.transition(transaction.workspaceId, transaction.id, operation.id, 'EXECUTING');
          try {
            await workspaceSandbox.mutate(transaction.workspaceId, operation);
            mutationJournal.append({ transactionId: transaction.id, workspaceId: transaction.workspaceId, state: 'OPERATION_COMPLETED', operationId: operation.id, operationKind: operation.kind, source: operation.source, target: operation.target });
            // A commit confirmation must also reach stable storage before reporting success.
            durableCheckpoints.transition(transaction.workspaceId, transaction.id, operation.id, 'COMMITTED');
            completedOperationIds.push(operation.id);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Never retry automatically: the mutation might already have occurred.
            try { durableCheckpoints.transition(transaction.workspaceId, transaction.id, operation.id, 'UNCERTAIN'); } catch { /* retain EXECUTING, which is uncertain on restart */ }
            try {
              mutationJournal.append({ transactionId: transaction.id, workspaceId: transaction.workspaceId, state: 'OPERATION_FAILED', operationId: operation.id, operationKind: operation.kind, source: operation.source, target: operation.target, error: message });
              mutationJournal.append({ transactionId: transaction.id, workspaceId: transaction.workspaceId, state: 'FAILED', error: message });
            } catch { /* journal failure must never trigger a replay */ }
            return { success: false, receipt: { transactionId: transaction.id, workspaceId: transaction.workspaceId, state: 'UNCERTAIN', completedOperationIds, failedOperationId: operation.id, error: message }, error: message };
          }
        }
        mutationJournal.append({transactionId:value.transaction.id,workspaceId:value.transaction.workspaceId,state:'COMPLETED'});return {success:true,receipt:{transactionId:value.transaction.id,workspaceId:value.transaction.workspaceId,state:'COMPLETED',completedOperationIds}};
      } catch(error) { return {success:false,error:error instanceof Error?error.message:String(error)}; }
      finally { releaseWorkspace(); }
  };

  const mutationDispatcher = new GovernedDesktopMutationDispatcher({
    authorized: isAuthorizedWorkspace,
    stopped: () => desktopMutationStopped,
    execute: (transaction, approvalToken) => handleExecuteMutation({ transaction, approvalToken }),
  });

  const validCubeRequest = (raw: unknown): raw is TrustedCreativeCommand => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) return false;
    const value = raw as Record<string, unknown>;
    const keys = Object.keys(value);
    return keys.length === 6 && ['schemaVersion', 'requestId', 'taskId', 'projectId', 'mode', 'templateId'].every(key => Object.hasOwn(value, key)) &&
      value.schemaVersion === 1 && value.mode === '3D' && value.templateId === 'primitive_cube_v1' &&
      typeof value.requestId === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(value.requestId) &&
      typeof value.taskId === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(value.taskId) &&
      validateWorkspaceId(value.projectId);
  };
  const stopCreative = () => { creativeRuntime?.stop(); };
  const creativeBusy = () => cubeApprovalPending || Boolean(creativeRuntime?.activeCount());
  const cubeApproval = async (command: TrustedCreativeCommand): Promise<boolean> => {
    if (desktopMutationStopped || !isAuthorizedWorkspace(command.projectId)) return false;
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'warning', title: 'Approve trusted MIO 3D scene',
      message: 'Create one validated 3D cube asset?',
      detail: 'Template: primitive_cube_v1. This writes one new project-scoped scene to local application data. Project: ' +
        command.projectId + '. Request: ' + command.requestId + '. No automatic rollback or retry.',
      buttons: ['Cancel', 'Create 3D Scene'], defaultId: 0, cancelId: 0, noLink: true,
    });
    return choice.response === 1 && !desktopMutationStopped && isAuthorizedWorkspace(command.projectId);
  };
  const invokeTrustedCube = async (request: unknown) => {
    if (!validCubeRequest(request)) return { success: false, status: 'DENIED', error: 'CREATIVE_COMMAND_INVALID_OR_WORKSPACE_MISMATCH' };
    if (desktopMutationStopped || !isAuthorizedWorkspace(request.projectId))
      return { success: false, status: 'DENIED', error: 'CREATIVE_STOPPED_OR_WORKSPACE_UNAUTHORIZED' };
    // A single global approval slot avoids competing modeless desktop dialogs.
    if (cubeApprovalPending) return { success: false, status: 'DENIED', error: 'CREATIVE_APPROVAL_ALREADY_PENDING' };
    cubeApprovalPending = true;
    try {
      if (!creativeRuntime) {
        const root = app.getPath('userData');
        creativeRuntime = createTrustedNodeCreativeExecutor(root, new TrustedCubeSceneAdapter(root, cubeApproval));
      }
      return await creativeRuntime.invoke(request);
    } catch {
      creativeRuntime?.stop();
      return { success: false, status: 'UNCERTAIN', error: 'CREATIVE_RUNTIME_UNAVAILABLE_REVIEW_REQUIRED' };
    } finally {
      cubeApprovalPending = false;
    }
  };

  return {
    handleCreateTrustedCube: (_event: IpcMainInvokeEvent, request: unknown) => invokeTrustedCube(request),
    handleInvokeDesktopReadCapability: (_event: IpcMainInvokeEvent, request: unknown) => desktopReadCapabilities.invoke(request),
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
      if (workspaceMutationLease.hasActive() || creativeBusy()) return { success: false, error: 'WORKSPACE_MUTATION_DRAIN_REQUIRED' };
      if (mainWindow) mainWindow.close();
      return { success: true };
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
      desktopMutationStopped = true;
      stopCreative();
      mutationApprovals.clear();
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
      if (workspaceMutationLease.isActive(workspaceId) || creativeBusy()) return { success: false, error: 'Active workspace or creative mutation must finish before authority can be revoked' };
      if (trainingJobManager.hasRunningForWorkspace(workspaceId)) {
        trainingJobManager.cancelWorkspace(workspaceId);
        return { success: false, error: 'Active governed training used this workspace. Cancellation was requested; retry revocation after the job reaches a terminal state.' };
      }
      mutationApprovals.revokeWorkspace(workspaceId);
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

    handleReadDocumentEntries: async (_event: IpcMainInvokeEvent, request: unknown) => {
      if (!validateWorkspacePathRequest(request)) return { success: false, error: 'Invalid document package-read request' };
      try {
        const archive = await workspaceSandbox.readDocumentArchive(request.workspaceId, request.relativePath);
        const allNames: string[] = [];
        // First pass intentionally requests no payload; current bounded ZIP reader validates local headers while walking.
        // Candidate OOXML names are derived by a lightweight local-header walk below without exposing arbitrary archive entries.
        const bytes = new Uint8Array(archive.bytes);
        let offset = 0;
        const u16 = (o: number) => bytes[o] | (bytes[o + 1] << 8);
        const u32 = (o: number) => (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] * 0x1000000)) >>> 0;
        while (offset + 30 <= bytes.length && u32(offset) === 0x04034b50) {
          const compressed = u32(offset + 18), nameLength = u16(offset + 26), extraLength = u16(offset + 28);
          const nameStart = offset + 30, dataStart = nameStart + nameLength + extraLength, dataEnd = dataStart + compressed;
          if (dataEnd > bytes.length) throw new Error('Truncated document ZIP entry');
          allNames.push(new TextDecoder('utf-8').decode(bytes.subarray(nameStart, nameStart + nameLength)));
          offset = dataEnd;
          if (allNames.length > 512) throw new Error('Document ZIP exceeds bounded entry count');
        }
        const wanted = allNames.map((name) => name.replace(/\\\\/g, '/')).filter((name) =>
          name === 'word/document.xml' ||
          /^ppt[/]slides[/]slide\\d+\\.xml$/i.test(name) ||
          name === 'xl/sharedStrings.xml' ||
          /^xl[/]worksheets[/]sheet\\d+\\.xml$/i.test(name)
        ).sort((a, b) => a.localeCompare(b));
        const entries = readBoundedZipEntries(bytes, new Set(wanted)).map((entry) => ({ name: entry.name, bytes: [...entry.bytes] }));
        return { success: true, entries, fileBytes: archive.fileBytes };
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

    handleInspectWorkspaceRecovery: (_event: IpcMainInvokeEvent, workspaceId: unknown) => {
      if (!validateWorkspaceId(workspaceId)) return { success: false, error: 'Invalid workspace recovery request' };
      // Renderer is restricted to workspaces explicitly authorized in this desktop session.
      if (!workspaceSandbox.listAuthorized().some(workspace => workspace.id === workspaceId)) {
        return { success: false, error: 'Workspace authorization required' };
      }
      try { return { success: true, inspection: durableCheckpoints.inspectRecovery(workspaceId) }; }
      catch { return { success: false, error: 'Recovery checkpoint unavailable or invalid; mutation remains blocked' }; }
    },

    handleListWorkspaceMutationAudit: (_event:IpcMainInvokeEvent, workspaceId:unknown) => {if(!validateWorkspaceId(workspaceId))return {success:false,error:'Invalid workspace audit request'};if(!isAuthorizedWorkspace(workspaceId))return {success:false,error:'Workspace authorization required'};try{return {success:true,events:mutationJournal.list(workspaceId,200)};}catch(error){return {success:false,error:error instanceof Error?error.message:String(error)};}},

    handleRequestWorkspaceMutationApproval: async (_event:IpcMainInvokeEvent, request:unknown) => {
      const value=request as {transaction?:DesktopMutationTransaction};if(!value?.transaction||!validateWorkspaceId(value.transaction.workspaceId))return {success:false,error:'Invalid mutation approval request'};
      if (!isAuthorizedWorkspace(value.transaction.workspaceId)) return {success:false,error:'Workspace authorization required'};
      if (desktopMutationStopped) return {success:false,error:'MUTATION_STOP_LATCHED'};
      const choice=await dialog.showMessageBox(mainWindow,{type:'warning',title:'Approve Mio file changes',message:`Approve ${value.transaction.operations.length} file operation(s)?`,detail:'Mio will execute only this exact workspace transaction. Approval expires in 5 minutes and can be used once.',buttons:['Cancel','Approve'],defaultId:0,cancelId:0,noLink:true});
      if(choice.response!==1)return {success:false,cancelled:true};
      if (desktopMutationStopped || !isAuthorizedWorkspace(value.transaction.workspaceId)) return {success:false,error:'Mutation stopped or workspace authority revoked'};
      return {success:true,approval:mutationApprovals.issue(value.transaction)};
    },

    handleInvokeApprovedMutation: (_event: IpcMainInvokeEvent, request: unknown) => mutationDispatcher.invoke(request),
    handleExecuteWorkspaceMutation: (_event: IpcMainInvokeEvent, request: unknown) => handleExecuteMutation(request),

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

    hasActiveWorkspaceMutations: () => workspaceMutationLease.hasActive() || creativeBusy(),
    requestStopWorkspaceMutations: () => { desktopMutationStopped = true; stopCreative(); mutationApprovals.clear(); },
    revokeAllWorkspaceAuthority: () => {
      desktopMutationStopped = true;
      stopCreative();
      if (!creativeBusy()) { try { creativeRuntime?.close(); } catch { /* preserve lock for manual checkpoint review */ } }
      trainingJobManager.forceStopAll();
      mutationApprovals.clear();
      workspaceSandbox.revokeAll();
    },
  };
}

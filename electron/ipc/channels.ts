export const IPC_CHANNELS = {
  // Window Controls
  WINDOW_MINIMIZE: 'mio:window:minimize',
  WINDOW_MAXIMIZE: 'mio:window:maximize',
  WINDOW_CLOSE: 'mio:window:close',
  WINDOW_IS_MAXIMIZED: 'mio:window:isMaximized',

  // System Information
  GET_SYSTEM_INFO: 'mio:system:getInfo',
  GET_APP_VERSION: 'mio:system:getVersion',

  // Desktop Notifications
  SHOW_NOTIFICATION: 'mio:notification:show',

  // Emergency Stop & Lifecycle
  EMERGENCY_STOP: 'mio:emergency:stop',
  QUIT_APP: 'mio:app:quit',

  // Workspace-scoped desktop filesystem bridge.
  // Renderer never sends arbitrary absolute filesystem paths.
  FS_AUTHORIZE_WORKSPACE: 'mio:fs:authorizeWorkspace',
  FS_REVOKE_WORKSPACE: 'mio:fs:revokeWorkspace',
  FS_READ_WORKSPACE_TEXT: 'mio:fs:readWorkspaceText',
  FS_LIST_WORKSPACE: 'mio:fs:listWorkspace',
  FS_HASH_WORKSPACE_TREE: 'mio:fs:hashWorkspaceTree',

  // Governed read-only browser bridge.
  BROWSER_READ_PAGE: 'mio:browser:readPage',

  // Governed fixed-entrypoint local training job bridge.
  TRAINING_START_JOB: 'mio:training:startJob',
  TRAINING_GET_JOB: 'mio:training:getJob',
  TRAINING_CANCEL_JOB: 'mio:training:cancelJob',
} as const;

export type IpcChannelKey = keyof typeof IPC_CHANNELS;

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

  // Controlled File Sandbox (Strict L0-L5)
  FS_SELECT_DIRECTORY: 'mio:fs:selectDirectory',
  FS_GET_WORKSPACE: 'mio:fs:getWorkspace',
  FS_READ_FILE: 'mio:fs:readFile',
  FS_WRITE_FILE: 'mio:fs:writeFile',
  FS_LIST_DIRECTORY: 'mio:fs:listDirectory',
  FS_MOVE_FILE: 'mio:fs:moveFile',
} as const;

export type IpcChannelKey = keyof typeof IPC_CHANNELS;

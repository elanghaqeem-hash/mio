export const IPC_CHANNELS = {
  WINDOW_MINIMIZE: 'mio:window:minimize',
  WINDOW_MAXIMIZE: 'mio:window:maximize',
  WINDOW_CLOSE: 'mio:window:close',
  WINDOW_IS_MAXIMIZED: 'mio:window:isMaximized',
  GET_SYSTEM_INFO: 'mio:system:getInfo',
  GET_APP_VERSION: 'mio:system:getVersion',
  GET_SECURITY_STATUS: 'mio:security:getStatus',
  SHOW_NOTIFICATION: 'mio:notification:show',
  EMERGENCY_STOP: 'mio:emergency:stop',
  QUIT_APP: 'mio:app:quit',

  FS_SELECT_DIRECTORY: 'mio:fs:selectDirectory',
  FS_GET_WORKSPACE: 'mio:fs:getWorkspace',
  FS_READ_FILE: 'mio:fs:readFile',
  FS_WRITE_FILE: 'mio:fs:writeFile',
  FS_LIST_DIRECTORY: 'mio:fs:listDirectory',
  FS_MOVE_FILE: 'mio:fs:moveFile',

  DB_STATUS: 'mio:db:status',
  SETTINGS_GET: 'mio:settings:get',
  SETTINGS_SET: 'mio:settings:set',
  PROJECT_LOAD: 'mio:project:load',
  PROJECT_SAVE: 'mio:project:save',
  AUDIT_LIST: 'mio:audit:list',

  PROVIDER_LIST: 'mio:provider:list',
  PROVIDER_SAVE: 'mio:provider:save',
  PROVIDER_REMOVE: 'mio:provider:remove',
  PROVIDER_TEST: 'mio:provider:test',
  PROVIDER_GENERATE: 'mio:provider:generate',
} as const;

export type IpcChannelKey = keyof typeof IPC_CHANNELS;

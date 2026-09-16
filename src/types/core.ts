export type MioCoreState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'PROCESSING'
  | 'EXECUTING'
  | 'ONLINE'
  | 'OFFLINE'
  | 'CREATIVE'
  | 'CREATING'
  | 'WAITING_PERMISSION'
  | '3D MODE'
  | 'ANIMATION MODE'
  | 'GRAPHIC MODE'
  | 'DRAWING MODE'
  | 'PHOTO MODE'
  | 'SFX MODE'
  | 'MUSIC MODE'
  | 'SECURITY'
  | 'WARNING'
  | 'ERROR'
  | 'SUCCESS'
  | 'EMOTIONAL SUPPORT';

export type MioSystemMode =
  | 'CHAT'
  | 'RESEARCH'
  | 'FILES'
  | 'MOTION'
  | '3D'
  | 'ANIMATION'
  | 'GRAPHIC'
  | 'DRAWING'
  | 'PHOTO'
  | 'SFX'
  | 'MUSIC'
  | 'PROJECT'
  | 'TASKS'
  | 'SETTINGS'
  | 'SECURITY';

export type AutonomyLevel =
  | 'PASSIVE'
  | 'ASSISTIVE'
  | 'PROACTIVE'
  | 'AUTONOMOUS';

export type NetworkState = 'ONLINE' | 'OFFLINE';

export interface SystemStatus {
  coreState: MioCoreState;
  activeMode: MioSystemMode;
  networkState: NetworkState;
  autonomyLevel: AutonomyLevel;
  microphoneActive: boolean;
  cameraActive: boolean;
  emergencyStopped: boolean;
  statusMessage: string;
}

export interface ActivityItem {
  id: string;
  timestamp: number;
  mode: MioSystemMode;
  description: string;
  type: 'info' | 'action' | 'warning' | 'error' | 'security';
}

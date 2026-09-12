export interface PoseTransferPoint {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface PoseTransferCapture {
  timestamp: number;
  landmarks: PoseTransferPoint[];
  confidence: number;
  gesture: string;
}

let pendingCapture: PoseTransferCapture | null = null;

export const poseTransferStore = {
  set(capture: PoseTransferCapture) {
    pendingCapture = {
      ...capture,
      landmarks: capture.landmarks.map((point) => ({ ...point })),
    };
  },
  take(): PoseTransferCapture | null {
    const capture = pendingCapture;
    pendingCapture = null;
    return capture;
  },
  peek(): PoseTransferCapture | null {
    return pendingCapture;
  },
};

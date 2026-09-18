import type { MotionComposition, MotionDocument } from "./model";
import { MotionCommandBus } from "./commands";
import { clampMotionFrame, stepMotionPlayback, type MotionPlaybackState } from "./runtime";
import type { TimelineSelection, TimelineViewport } from "./timeline";

export interface MotionWorkspaceState {
  document: MotionDocument;
  playback: MotionPlaybackState;
  selection: TimelineSelection;
  viewport: TimelineViewport;
}

export class MotionWorkspaceController {
  readonly commands: MotionCommandBus;
  private playback: MotionPlaybackState;
  private selection: TimelineSelection = { layerIds: [], keyframeIds: [] };
  private viewport: TimelineViewport = { startFrame: 0, pixelsPerFrame: 8, widthPx: 800 };

  constructor(document: MotionDocument) {
    this.commands = new MotionCommandBus(document);
    this.playback = { frame: 0, playing: false, loop: true, rate: 1 };
  }

  get composition(): MotionComposition {
    const document = this.commands.document;
    const composition = document.compositions.find((item) => item.id === document.activeCompositionId);
    if (!composition) throw new Error("Active motion composition is missing");
    return composition;
  }

  snapshot(): MotionWorkspaceState {
    return { document: this.commands.document, playback: { ...this.playback }, selection: { layerIds: [...this.selection.layerIds], keyframeIds: [...this.selection.keyframeIds] }, viewport: { ...this.viewport } };
  }

  seek(frame: number): void { this.playback = { ...this.playback, frame: clampMotionFrame(this.composition, frame) }; }
  setPlaying(playing: boolean): void { this.playback = { ...this.playback, playing }; }
  setLoop(loop: boolean): void { this.playback = { ...this.playback, loop }; }
  tick(elapsedSeconds: number): void { this.playback = stepMotionPlayback(this.composition, this.playback, elapsedSeconds); }
  setSelection(selection: TimelineSelection): void { this.selection = { layerIds: [...selection.layerIds], keyframeIds: [...selection.keyframeIds] }; }
  setViewport(viewport: TimelineViewport): void { this.viewport = { ...viewport, pixelsPerFrame: Math.max(.1, viewport.pixelsPerFrame), widthPx: Math.max(1, viewport.widthPx) }; }
}

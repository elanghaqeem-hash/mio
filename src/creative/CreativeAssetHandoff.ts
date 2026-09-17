import { eventBus } from '../core/EventBus';
import type { MioSystemMode } from '../types/core';
import type { AssetType } from '../types/project';

export interface CreativeAssetHandoff {
  taskId: string;
  assetId: string;
  assetType: AssetType;
  mode: MioSystemMode;
  name: string;
  createdAt: number;
}

class CreativeAssetHandoffController {
  private pending: CreativeAssetHandoff | null = null;

  public publish(handoff: Omit<CreativeAssetHandoff, 'createdAt'>): CreativeAssetHandoff {
    const next = { ...handoff, createdAt: Date.now() };
    this.pending = next;
    eventBus.emit('CREATIVE_ASSET_READY', next);
    return next;
  }

  public consume(mode: MioSystemMode): CreativeAssetHandoff | null {
    if (!this.pending || this.pending.mode !== mode) return null;
    const handoff = this.pending;
    this.pending = null;
    return handoff;
  }

  public peek(): CreativeAssetHandoff | null { return this.pending ? { ...this.pending } : null; }
}

export const creativeAssetHandoff = new CreativeAssetHandoffController();

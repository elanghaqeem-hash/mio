import type {
  CreativeCommand,
  CreativeCommandEnvelope,
  CreativeDocument,
  CreativeDocumentValidation,
  CreativeNode,
  CreativeOperationRecord,
} from '../types/creativeDocument';

interface HistoryEntry {
  forward: CreativeCommand;
  inverse: CreativeCommand;
}

const clone = <T>(value: T): T => structuredClone(value);

const collectSubtree = (document: CreativeDocument, nodeId: string): CreativeNode[] => {
  const root = document.nodes[nodeId];
  if (!root) return [];
  const output: CreativeNode[] = [];
  const visit = (id: string): void => {
    const node = document.nodes[id];
    if (!node) return;
    output.push(clone(node));
    node.childIds.forEach(visit);
  };
  visit(nodeId);
  return output;
};

const siblingIds = (document: CreativeDocument, parentId: string | null): string[] =>
  parentId === null ? document.rootNodeIds : document.nodes[parentId]?.childIds ?? [];

const replaceSiblingIds = (document: CreativeDocument, parentId: string | null, ids: string[]): void => {
  if (parentId === null) document.rootNodeIds = ids;
  else document.nodes[parentId].childIds = ids;
};

const insertAt = (items: string[], value: string, index = items.length): string[] => {
  const output = items.filter((item) => item !== value);
  output.splice(Math.max(0, Math.min(index, output.length)), 0, value);
  return output;
};

export const validateCreativeDocument = (document: CreativeDocument): CreativeDocumentValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set(Object.keys(document.nodes));
  const rootIds = new Set(document.rootNodeIds);

  if (document.schemaVersion < 1) errors.push('Unsupported creative document schema version.');
  if (!document.id.trim()) errors.push('Document ID is required.');
  if (rootIds.size !== document.rootNodeIds.length) errors.push('Root node IDs must be unique.');

  for (const rootId of document.rootNodeIds) {
    if (!nodeIds.has(rootId)) errors.push(`Root node ${rootId} does not exist.`);
    else if (document.nodes[rootId].parentId !== null) errors.push(`Root node ${rootId} cannot have a parent.`);
  }

  for (const node of Object.values(document.nodes)) {
    if (new Set(node.childIds).size !== node.childIds.length) errors.push(`Node ${node.id} has duplicate children.`);
    if (node.parentId === null && !rootIds.has(node.id)) errors.push(`Detached root node ${node.id}.`);
    if (node.parentId !== null && !nodeIds.has(node.parentId)) errors.push(`Node ${node.id} has missing parent ${node.parentId}.`);
    if (node.parentId !== null && !document.nodes[node.parentId]?.childIds.includes(node.id)) errors.push(`Parent link for ${node.id} is not reciprocal.`);
    for (const childId of node.childIds) {
      if (!nodeIds.has(childId)) errors.push(`Node ${node.id} has missing child ${childId}.`);
      else if (document.nodes[childId].parentId !== node.id) errors.push(`Child link ${node.id} -> ${childId} is not reciprocal.`);
    }
    for (const assetId of node.assetReferenceIds ?? []) {
      if (!document.assets[assetId]) errors.push(`Node ${node.id} references missing asset ${assetId}.`);
    }
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string): void => {
    if (active.has(id)) { errors.push(`Cycle detected at node ${id}.`); return; }
    if (visited.has(id) || !document.nodes[id]) return;
    active.add(id);
    document.nodes[id].childIds.forEach(visit);
    active.delete(id);
    visited.add(id);
  };
  document.rootNodeIds.forEach(visit);
  if (visited.size !== nodeIds.size) errors.push('One or more nodes are unreachable from the document roots.');

  for (const selectedId of document.selection.nodeIds) if (!nodeIds.has(selectedId)) errors.push(`Selection references missing node ${selectedId}.`);
  if (document.selection.primaryNodeId && !document.selection.nodeIds.includes(document.selection.primaryNodeId)) errors.push('Primary selection must be included in nodeIds.');
  for (const track of document.timeline?.tracks ?? []) if (!nodeIds.has(track.nodeId)) warnings.push(`Timeline track ${track.id} targets missing node ${track.nodeId}.`);
  return { valid: errors.length === 0, errors, warnings };
};

export class CreativeDocumentKernel {
  private document: CreativeDocument;
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];

  public constructor(document: CreativeDocument) {
    const validation = validateCreativeDocument(document);
    if (!validation.valid) throw new Error(`Invalid creative document: ${validation.errors.join(' ')}`);
    this.document = clone(document);
  }

  public snapshot(): CreativeDocument { return clone(this.document); }
  public canUndo(): boolean { return this.undoStack.length > 0; }
  public canRedo(): boolean { return this.redoStack.length > 0; }

  public execute(envelope: CreativeCommandEnvelope): CreativeDocument {
    const before = clone(this.document);
    let inverse: CreativeCommand;
    try {
      inverse = this.inverseFor(envelope.command);
      this.apply(envelope.command);
      this.finalize(envelope, 'execute');
      const validation = validateCreativeDocument(this.document);
      if (!validation.valid) throw new Error(`Creative command rejected: ${validation.errors.join(' ')}`);
    } catch (error) {
      this.document = before;
      throw error;
    }
    this.undoStack.push({ forward: clone(envelope.command), inverse });
    this.redoStack.length = 0;
    return this.snapshot();
  }

  public undo(actor: CreativeCommandEnvelope['actor'] = 'user'): CreativeDocument {
    const entry = this.undoStack.pop();
    if (!entry) return this.snapshot();
    this.apply(entry.inverse);
    this.finalize({ actor, command: entry.inverse }, 'undo');
    this.redoStack.push(entry);
    return this.snapshot();
  }

  public redo(actor: CreativeCommandEnvelope['actor'] = 'user'): CreativeDocument {
    const entry = this.redoStack.pop();
    if (!entry) return this.snapshot();
    this.apply(entry.forward);
    this.finalize({ actor, command: entry.forward }, 'redo');
    this.undoStack.push(entry);
    return this.snapshot();
  }

  private finalize(envelope: CreativeCommandEnvelope, action: CreativeOperationRecord['action']): void {
    const timestamp = envelope.timestamp ?? Date.now();
    this.document.revision += 1;
    this.document.updatedAt = timestamp;
    this.document.operations.push({
      id: envelope.id ?? `op_${timestamp}_${this.document.revision}`,
      timestamp,
      actor: envelope.actor ?? 'user',
      action,
      command: clone(envelope.command),
      revision: this.document.revision,
    });
  }

  private inverseFor(command: CreativeCommand): CreativeCommand {
    switch (command.type) {
      case 'node.create': return { type: 'node.delete', nodeId: command.node.id };
      case 'node.restore': return { type: 'batch', commands: command.placements.map(({ nodeId }) => ({ type: 'node.delete', nodeId })) };
      case 'node.update': {
        const node = this.requireNode(command.nodeId);
        const changes: Record<string, unknown> = {};
        for (const key of Object.keys(command.changes)) changes[key] = clone(node[key as keyof CreativeNode]);
        return { type: 'node.update', nodeId: node.id, changes } as CreativeCommand;
      }
      case 'node.delete': {
        const node = this.requireNode(command.nodeId);
        return {
          type: 'node.restore',
          nodes: collectSubtree(this.document, node.id),
          placements: [{ nodeId: node.id, parentId: node.parentId, index: siblingIds(this.document, node.parentId).indexOf(node.id) }],
        };
      }
      case 'node.reorder': {
        const node = this.requireNode(command.nodeId);
        const oldParentId = node.parentId;
        const oldIndex = siblingIds(this.document, oldParentId).indexOf(node.id);
        return { type: 'node.reorder', nodeId: node.id, parentId: oldParentId, index: oldIndex };
      }
      case 'selection.set': return { type: 'selection.set', ...clone(this.document.selection) };
      case 'document.update': {
        const changes: { name?: string; metadata?: Record<string, unknown>; timeline?: CreativeDocument['timeline'] | null } = {};
        if ('name' in command.changes) changes.name = this.document.name;
        if ('metadata' in command.changes) changes.metadata = clone(this.document.metadata);
        if ('timeline' in command.changes) changes.timeline = this.document.timeline ? clone(this.document.timeline) : null;
        return { type: 'document.update', changes } as CreativeCommand;
      }
      case 'batch': {
        const sandbox = new CreativeDocumentKernel(this.snapshot());
        const inverses: CreativeCommand[] = [];
        for (const nested of command.commands) { inverses.unshift(sandbox.inverseFor(nested)); sandbox.apply(nested); }
        return { type: 'batch', commands: inverses };
      }
    }
  }

  private apply(command: CreativeCommand): void {
    switch (command.type) {
      case 'node.create': {
        if (this.document.nodes[command.node.id]) throw new Error(`Node ${command.node.id} already exists.`);
        if (command.node.parentId !== null) this.requireNode(command.node.parentId);
        this.document.nodes[command.node.id] = clone(command.node);
        replaceSiblingIds(this.document, command.node.parentId, insertAt(siblingIds(this.document, command.node.parentId), command.node.id, command.index));
        return;
      }
      case 'node.restore': {
        for (const node of command.nodes) if (this.document.nodes[node.id]) throw new Error(`Node ${node.id} already exists.`);
        for (const node of command.nodes) this.document.nodes[node.id] = clone(node);
        for (const placement of command.placements) {
          this.requireNode(placement.nodeId);
          if (placement.parentId !== null) this.requireNode(placement.parentId);
          replaceSiblingIds(this.document, placement.parentId, insertAt(siblingIds(this.document, placement.parentId), placement.nodeId, placement.index));
        }
        return;
      }
      case 'node.update': Object.assign(this.requireNode(command.nodeId), clone(command.changes)); return;
      case 'node.delete': {
        const node = this.requireNode(command.nodeId);
        replaceSiblingIds(this.document, node.parentId, siblingIds(this.document, node.parentId).filter((id) => id !== node.id));
        for (const removed of collectSubtree(this.document, node.id)) delete this.document.nodes[removed.id];
        const remaining = this.document.selection.nodeIds.filter((id) => Boolean(this.document.nodes[id]));
        this.document.selection = { nodeIds: remaining, primaryNodeId: remaining.includes(this.document.selection.primaryNodeId ?? '') ? this.document.selection.primaryNodeId : remaining[0] ?? null };
        return;
      }
      case 'node.reorder': {
        const node = this.requireNode(command.nodeId);
        if (command.parentId === node.id || collectSubtree(this.document, node.id).some((item) => item.id === command.parentId)) throw new Error('Cannot move a node beneath its own subtree.');
        if (command.parentId !== null) this.requireNode(command.parentId);
        replaceSiblingIds(this.document, node.parentId, siblingIds(this.document, node.parentId).filter((id) => id !== node.id));
        node.parentId = command.parentId;
        replaceSiblingIds(this.document, node.parentId, insertAt(siblingIds(this.document, node.parentId), node.id, command.index));
        return;
      }
      case 'selection.set': this.document.selection = { nodeIds: [...new Set(command.nodeIds)], primaryNodeId: command.primaryNodeId }; return;
      case 'document.update': {
        const changes = clone(command.changes);
        if (changes.timeline === null) {
          delete this.document.timeline;
          delete changes.timeline;
        }
        Object.assign(this.document, changes);
        return;
      }
      case 'batch': command.commands.forEach((nested) => this.apply(nested)); return;
    }
  }

  private requireNode(nodeId: string): CreativeNode {
    const node = this.document.nodes[nodeId];
    if (!node) throw new Error(`Node ${nodeId} does not exist.`);
    return node;
  }
}

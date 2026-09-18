import type { MotionDocument } from "./model";
import { validateMotionDocument } from "./validation";

export interface MotionCommand {
  readonly id: string;
  readonly label: string;
  apply(document: MotionDocument): MotionDocument;
}

export interface MotionTransaction {
  readonly id: string;
  readonly label: string;
  readonly commands: readonly MotionCommand[];
}

export class MotionCommandBus {
  private past: MotionDocument[] = [];
  private future: MotionDocument[] = [];

  constructor(private current: MotionDocument) {
    validateMotionDocument(current);
  }

  get document(): MotionDocument { return this.current; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  execute(transaction: MotionTransaction): MotionDocument {
    let next = this.current;
    for (const command of transaction.commands) next = command.apply(next);
    validateMotionDocument(next);
    this.past.push(this.current);
    this.current = next;
    this.future = [];
    return this.current;
  }

  undo(): MotionDocument {
    const previous = this.past.pop();
    if (!previous) return this.current;
    this.future.push(this.current);
    this.current = previous;
    return this.current;
  }

  redo(): MotionDocument {
    const next = this.future.pop();
    if (!next) return this.current;
    this.past.push(this.current);
    this.current = next;
    return this.current;
  }
}

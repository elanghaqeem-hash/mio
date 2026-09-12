import { MioTool } from '../../types/tools';

type RegisteredTool = MioTool<any, any>;

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  public register<I, O>(tool: MioTool<I, O>): void {
    if (!tool.id.trim()) throw new Error('Tool id is required');
    if (this.tools.has(tool.id)) throw new Error(`Tool '${tool.id}' is already registered`);
    this.tools.set(tool.id, tool);
  }

  public get(toolId: string): RegisteredTool | undefined {
    return this.tools.get(toolId);
  }

  public list(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  public has(toolId: string): boolean {
    return this.tools.has(toolId);
  }
}

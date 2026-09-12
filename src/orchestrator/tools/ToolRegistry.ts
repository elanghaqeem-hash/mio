import { MioTool } from '../../types/tools';

export class ToolRegistry {
  private readonly tools = new Map<string, MioTool>();

  public register(tool: MioTool): void {
    if (!tool.id.trim()) throw new Error('Tool id is required');
    if (this.tools.has(tool.id)) throw new Error(`Tool '${tool.id}' is already registered`);
    this.tools.set(tool.id, tool);
  }

  public get(toolId: string): MioTool | undefined {
    return this.tools.get(toolId);
  }

  public list(): MioTool[] {
    return Array.from(this.tools.values());
  }

  public has(toolId: string): boolean {
    return this.tools.has(toolId);
  }
}

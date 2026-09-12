type EventHandler<T = any> = (data: T) => void;

class MioEventBus {
  private events: Map<string, EventHandler[]> = new Map();

  on<T = any>(event: string, handler: EventHandler<T>): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler) {
    const handlers = this.events.get(event);
    if (!handlers) return;
    this.events.set(
      event,
      handlers.filter((h) => h !== handler)
    );
  }

  emit<T = any>(event: string, data?: T) {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(data);
        } catch (err) {
          console.error(`[MioEventBus] Error in event '${event}':`, err);
        }
      });
    }
  }

  clearAll() {
    this.events.clear();
  }
}

export const eventBus = new MioEventBus();

type EventWriter = (event: string, data?: unknown) => void;

export interface EventBus {
  /** Subscribe a writer. Returns an unsubscribe function. */
  subscribe(w: EventWriter): () => void;
  /** Emit to all subscribers. A writer that throws is removed. */
  emit(event: string, data?: unknown): void;
}

export function createBus(): EventBus {
  const writers = new Set<EventWriter>();
  return {
    subscribe(w) {
      writers.add(w);
      return () => writers.delete(w);
    },
    emit(event, data) {
      for (const w of [...writers]) {
        try {
          w(event, data);
        } catch {
          writers.delete(w);
        }
      }
    },
  };
}

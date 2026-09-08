export const EVENT_NAMES = [
  "library-changed",
  "libraries-changed",
  "peaks-ready",
  "peaks-failed",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/**
 * Open the SSE stream. The browser EventSource reconnects automatically on
 * drop; queries revalidate on the next event, so a dropped stream is harmless.
 * Returns a close function.
 */
export function openEvents(
  onEvent: (name: EventName, data: { path?: string }) => void,
): () => void {
  const es = new EventSource("/api/events");
  const handlers = new Map<EventName, EventListener>();
  for (const name of EVENT_NAMES) {
    const h: EventListener = (msg) => {
      let data: { path?: string } = {};
      const raw = (msg as MessageEvent).data;
      if (raw) {
        try {
          data = JSON.parse(raw) as { path?: string };
        } catch {
          data = {};
        }
      }
      onEvent(name, data);
    };
    handlers.set(name, h);
    es.addEventListener(name, h);
  }
  return () => {
    for (const [name, h] of handlers) es.removeEventListener(name, h);
    es.close();
  };
}

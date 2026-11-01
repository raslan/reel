import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AudioProvider } from "../player/AudioProvider";
import { AppProvider } from "../state/context";

// React's act() wants to know the environment opts in.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  container: HTMLElement;
  unmount: () => void;
}

/** Mount `ui` inside the app's real providers, with a fresh query cache and no retries. */
export async function mountApp(ui: ReactNode): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <QueryClientProvider client={qc}>
        <AppProvider>
          <AudioProvider>{ui}</AudioProvider>
        </AppProvider>
      </QueryClientProvider>,
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Poll until `cond` holds (inside act, so React flushes between checks); fail after `timeoutMs`. */
export async function until(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error("until(): condition not met in time");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

/** Run `fn` inside act and let queued promises (query fetches, play() rejections) settle. */
export async function flush(fn?: () => void): Promise<void> {
  await act(async () => {
    fn?.();
    await new Promise((r) => setTimeout(r, 0));
  });
}

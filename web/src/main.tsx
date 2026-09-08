import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { Toaster } from "./components/ui/sonner";
import { AudioProvider } from "./player/AudioProvider";
import { AppProvider } from "./state/context";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <AudioProvider>
          <App />
          <Toaster richColors position="bottom-center" />
        </AudioProvider>
      </AppProvider>
    </QueryClientProvider>
  </StrictMode>,
);

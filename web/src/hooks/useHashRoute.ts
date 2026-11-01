import { useEffect, useRef } from "react";
import { formatHash, parseHash } from "../lib/route";
import { useAppDispatch, useAppState } from "../state/context";

/**
 * Keeps the URL hash and the screen/folder in step. State is the source of truth
 * while the app is used (each change pushes a history entry, so Back walks
 * folders); the hash is adopted on load and whenever it changes underneath us.
 */
export function useHashRoute(): void {
  const { screen, folderPath } = useAppState();
  const dispatch = useAppDispatch();
  const synced = useRef(false);

  useEffect(() => {
    const wanted = formatHash({ screen, folderPath });
    if (window.location.hash === wanted) {
      synced.current = true;
      return;
    }
    // First sync only normalises the initial URL; after that every change is a step in history.
    if (synced.current) window.history.pushState(null, "", wanted);
    else window.history.replaceState(null, "", wanted);
    synced.current = true;
  }, [screen, folderPath]);

  useEffect(() => {
    const onHashChange = () => {
      const route = parseHash(window.location.hash);
      dispatch({ type: "navigate", ...route });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [dispatch]);
}

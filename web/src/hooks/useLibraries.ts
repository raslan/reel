import { useQuery } from "@tanstack/react-query";
import { getLibraries } from "../lib/api";
import { librariesKey } from "../lib/keys";

export function useLibraries() {
  return useQuery({
    queryKey: librariesKey,
    queryFn: getLibraries,
    refetchInterval: 60_000,
  });
}

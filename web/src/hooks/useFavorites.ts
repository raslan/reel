import { useQuery } from "@tanstack/react-query";
import { getFavorites } from "../lib/api";
import { favoritesKey } from "../lib/keys";

export function useFavorites() {
  return useQuery({ queryKey: favoritesKey, queryFn: getFavorites });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addFavorite, errorMessage, removeFavorite } from "../lib/api";
import { favoritesKey } from "../lib/keys";
import type { FavoritesResponse } from "../types/api";

/** Optimistic star toggle with rollback and a quiet error toast. */
export function useFavoriteToggle() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (vars: { path: string; add: boolean }) =>
      vars.add ? addFavorite(vars.path) : removeFavorite(vars.path),
    onMutate: async ({ path, add }) => {
      await qc.cancelQueries({ queryKey: favoritesKey });
      const prev = qc.getQueryData<FavoritesResponse>(favoritesKey);
      if (prev) {
        const paths = add
          ? [...new Set([...prev.paths, path])]
          : prev.paths.filter((p) => p !== path);
        qc.setQueryData<FavoritesResponse>(favoritesKey, { paths });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(favoritesKey, ctx.prev);
      toast.error(errorMessage(err));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: favoritesKey });
    },
  });
  return { toggle: (path: string, add: boolean) => mutation.mutate({ path, add }) };
}

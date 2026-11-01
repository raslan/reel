import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addFavorite, errorMessage, removeFavorite } from "../lib/api";
import { applyFavoriteToggle } from "../lib/favorites";
import { favoritesKey } from "../lib/keys";
import type { FavoritesResponse } from "../types/api";
import type { FileEntry } from "../types/library";

/** Optimistic star toggle with rollback and a quiet error toast. */
export function useFavoriteToggle() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (vars: { file: FileEntry; add: boolean }) =>
      vars.add ? addFavorite(vars.file.path) : removeFavorite(vars.file.path),
    onMutate: async ({ file, add }) => {
      await qc.cancelQueries({ queryKey: favoritesKey });
      const prev = qc.getQueryData<FavoritesResponse>(favoritesKey);
      if (prev) qc.setQueryData(favoritesKey, applyFavoriteToggle(prev, file, add));
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
  return { toggle: (file: FileEntry, add: boolean) => mutation.mutate({ file, add }) };
}

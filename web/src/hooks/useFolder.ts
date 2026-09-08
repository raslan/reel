import { useQuery } from "@tanstack/react-query";
import { listFolder } from "../lib/api";
import { folderKey } from "../lib/keys";

export function useFolder(path: string) {
  return useQuery({
    queryKey: folderKey(path),
    queryFn: () => listFolder(path),
  });
}

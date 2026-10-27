import { useEffect } from "react";

/** Sets the tab title to "Page · Sovra". */
export function useTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${page} · Sovra` : "Sovra";
  }, [page]);
}

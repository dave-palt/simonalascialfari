import { useEffect, useRef } from "react";

/** Trappa il Tab dentro l'elemento mentre `open` è true; alla chiusura
 *  ripristina il focus all'elemento che lo aveva prima dell'apertura
 *  (WCAG 2.4.3). SSR-safe: tutta la logica vive in un effect, quindi il
 *  prerender (renderToString) non la esegue mai. */
export function useFocusTrap<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || !ref.current) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const sel =
      "a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex='-1'])";
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(sel));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      restoreRef.current?.focus();
    };
  }, [open]);

  return ref;
}

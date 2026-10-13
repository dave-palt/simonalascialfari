import { useEffect } from "react";

/**
 * Tema chiaro/scuro seguendo il dispositivo (prefers-color-scheme),
 * Nessun toggle manuale, stessa scelta dell'admin (selfhost).
 *
 * La classe `.dark` su <html> attiva il set di variabili in index.css.
 * Lo script inline in index.html la imposta PRIMA del paint (niente flash):
 * questo hook serve solo a restare sincronizzati se l'utente cambia tema
 * di sistema mentre la pagina è aperta. Solo useEffect → SSR/prerender-safe.
 */
export function useDeviceTheme() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
}

import { useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import { BackToHome } from "@/components/back-to-home";

export default function NotFound() {
  const { language } = useTranslation();

  // a11y/SEO (WCAG 2.4.2): titolo specifico per la 404
  useEffect(() => {
    document.title = "404 — Simona Lascialfari";
  }, []);

  return (
    <main className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background text-foreground px-6 text-center">
      <h1 className="font-serif text-6xl md:text-8xl tracking-[0.15em] font-light">404</h1>
      <p className="mt-6 text-xs tracking-[0.3em] uppercase text-foreground/60">
        {language === "it" ? "Pagina non trovata" : "Page not found"}
      </p>
      <BackToHome className="mt-12" />
    </main>
  );
}

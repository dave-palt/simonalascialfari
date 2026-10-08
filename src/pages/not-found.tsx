import { useTranslation } from "@/lib/i18n";
import { Link } from "wouter";

export default function NotFound() {
  const { language } = useTranslation();
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background text-foreground px-6 text-center">
      <p className="font-serif text-6xl md:text-8xl tracking-[0.15em] font-light">404</p>
      <p className="mt-6 text-xs tracking-[0.3em] uppercase text-foreground/60">
        {language === "it" ? "Pagina non trovata" : "Page not found"}
      </p>
      <Link
        href="/"
        className="mt-12 text-[10px] tracking-widest uppercase border-b border-foreground/40 pb-1 hover:border-foreground transition-colors"
      >
        {language === "it" ? "Torna alla home" : "Back to home"}
      </Link>
    </div>
  );
}

import { useTranslation } from "@/lib/i18n";
import { Link } from "wouter";

/**
 * Link "← Torna alla home" condiviso dalle sottopagine (privacy, cookie, 404).
 * Stile di riferimento: privacy page. `className` solo per margini/posizione.
 */
export function BackToHome({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Link
      href="/"
      className={`text-[10px] tracking-[0.3em] uppercase text-foreground/50 hover:text-foreground transition-colors ${className}`}
    >
      ← {t("nav.backHome")}
    </Link>
  );
}

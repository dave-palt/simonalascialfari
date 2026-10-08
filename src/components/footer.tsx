import { useTranslation } from "@/lib/i18n";
import { Link } from "wouter";

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="py-8 px-6 md:px-12 bg-background text-foreground border-t border-border/30">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-[10px] tracking-widest uppercase text-foreground/50">
        <p>{t("footer.rights")}</p>
        <div className="flex items-center gap-6">
          <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
            {t("footer.privacy")}
          </Link>
          <Link href="/cookie-policy" className="hover:text-foreground transition-colors">
            {t("footer.cookie")}
          </Link>
        </div>
      </div>
    </footer>
  );
}

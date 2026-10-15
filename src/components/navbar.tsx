import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";

export function Navbar() {
  const { language, setLanguage, t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // a11y: anchor semantici + focus sulla sezione — scrollIntoView da solo
  // lascerebbe il focus (e lo screen reader) sulla navbar
  const scrollTo = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.setAttribute("tabindex", "-1");
      el.scrollIntoView({ behavior: "smooth" });
      el.focus({ preventScroll: true });
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-500 flex items-center justify-between px-6 py-4 md:px-12 ${
        scrolled ? "bg-background/90 backdrop-blur-md border-b border-border/50" : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="flex-1 hidden md:flex items-center gap-6 text-xs tracking-widest uppercase">
        <a href="#hero" onClick={(e) => scrollTo(e, "hero")} className="hover:text-foreground/70 transition-colors">
          {t("nav.home")}
        </a>
        <a href="#portfolio" onClick={(e) => scrollTo(e, "portfolio")} className="hover:text-foreground/70 transition-colors">
          {t("nav.portfolio")}
        </a>
      </div>

      <div className="flex-1 flex justify-center">
        <a
          href="#hero"
          onClick={(e) => scrollTo(e, "hero")}
          className={`font-serif text-lg md:text-xl tracking-[0.25em] text-foreground transition-opacity duration-500 ${
            // a11y: invisible (non solo opaco) quando nascosto — fuori dal tab order
            scrolled ? "opacity-100" : "opacity-0 pointer-events-none invisible"
          }`}
        >
          SIMONA LASCIALFARI
        </a>
      </div>

      <div className="flex-1 hidden md:flex items-center justify-end gap-6 text-xs tracking-widest uppercase">
        <a href="#about" onClick={(e) => scrollTo(e, "about")} className="hover:text-foreground/70 transition-colors">
          {t("nav.about")}
        </a>
        <a href="#contact" onClick={(e) => scrollTo(e, "contact")} className="hover:text-foreground/70 transition-colors">
          {t("nav.contact")}
        </a>
        <div className="flex items-center gap-2 ml-4 border-l border-foreground/20 pl-6">
          <button
            className={`transition-colors ${language === "it" ? "text-foreground font-semibold" : "text-foreground/70 hover:text-foreground"}`}
            aria-pressed={language === "it"}
            onClick={() => setLanguage("it")}
          >
            IT
          </button>
          <span aria-hidden="true" className="text-foreground/20">|</span>
          <button
            className={`transition-colors ${language === "en" ? "text-foreground font-semibold" : "text-foreground/70 hover:text-foreground"}`}
            aria-pressed={language === "en"}
            onClick={() => setLanguage("en")}
          >
            EN
          </button>
        </div>
      </div>

      <div className="md:hidden flex items-center">
         <div className="flex items-center gap-2 text-xs tracking-widest">
          <button
            className={`${language === "it" ? "text-foreground font-semibold" : "text-foreground/70"}`}
            aria-pressed={language === "it"}
            onClick={() => setLanguage("it")}
          >
            IT
          </button>
          <span aria-hidden="true" className="text-foreground/20">|</span>
          <button
            className={`${language === "en" ? "text-foreground font-semibold" : "text-foreground/70"}`}
            aria-pressed={language === "en"}
            onClick={() => setLanguage("en")}
          >
            EN
          </button>
        </div>
      </div>
    </nav>
  );
}

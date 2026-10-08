import { Link } from "wouter";
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

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-500 flex items-center justify-between px-6 py-4 md:px-12 ${
        scrolled ? "bg-background/90 backdrop-blur-md border-b border-border/50" : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="flex-1 hidden md:flex items-center gap-6 text-xs tracking-widest uppercase">
        <button onClick={() => scrollTo("hero")} className="hover:text-foreground/70 transition-colors">
          {t("nav.home")}
        </button>
        <button onClick={() => scrollTo("portfolio")} className="hover:text-foreground/70 transition-colors">
          {t("nav.portfolio")}
        </button>
      </div>

      <div className="flex-1 flex justify-center">
        <button
          onClick={() => scrollTo("hero")}
          className={`font-serif text-lg md:text-xl tracking-[0.25em] text-foreground transition-opacity duration-500 ${scrolled ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          SIMONA LASCIALFARI
        </button>
      </div>

      <div className="flex-1 hidden md:flex items-center justify-end gap-6 text-xs tracking-widest uppercase">
        <button onClick={() => scrollTo("about")} className="hover:text-foreground/70 transition-colors">
          {t("nav.about")}
        </button>
        <button onClick={() => scrollTo("contact")} className="hover:text-foreground/70 transition-colors">
          {t("nav.contact")}
        </button>
        <div className="flex items-center gap-2 ml-4 border-l border-foreground/20 pl-6">
          <button 
            className={`transition-colors ${language === "it" ? "text-foreground font-semibold" : "text-foreground/50 hover:text-foreground"}`}
            onClick={() => setLanguage("it")}
          >
            IT
          </button>
          <span className="text-foreground/20">|</span>
          <button 
            className={`transition-colors ${language === "en" ? "text-foreground font-semibold" : "text-foreground/50 hover:text-foreground"}`}
            onClick={() => setLanguage("en")}
          >
            EN
          </button>
        </div>
      </div>

      <div className="md:hidden flex items-center">
         <div className="flex items-center gap-2 text-xs tracking-widest">
          <button 
            className={`${language === "it" ? "text-foreground font-semibold" : "text-foreground/50"}`}
            onClick={() => setLanguage("it")}
          >
            IT
          </button>
          <span className="text-foreground/20">|</span>
          <button 
            className={`${language === "en" ? "text-foreground font-semibold" : "text-foreground/50"}`}
            onClick={() => setLanguage("en")}
          >
            EN
          </button>
        </div>
      </div>
    </nav>
  );
}

import { createContext, useContext, useEffect, useState } from "react";

type Language = "it" | "en";

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  it: {
    "nav.home": "HOME",
    "nav.portfolio": "PORTFOLIO",
    "nav.about": "CHI SONO",
    "nav.contact": "CONTATTI",
    "hero.tagline": "Fotografa — Bagno a Ripoli",
    "genre.danza": "Danza",
    "genre.maternita": "Maternità",
    "genre.ritratto": "Ritratto",
    "genre.racconti": "Racconti",
    "about.title": "CHI SONO",
    "about.text": "Mi chiamo Simona, sono una fotografa con base a Bagno a Ripoli. Mi occupo principalmente di ritratto, fotografia di danza e maternità, ambiti in cui il corpo, il gesto e l'emozione diventano il centro dell'immagine. Curo inoltre la fotografia di interni, influenzata dalla mia formazione come interior designer, che mi permette di leggere lo spazio e valorizzarlo con un occhio orientato alla progettazione. Il mio lavoro nasce dal desiderio di raccontare persone, movimento e spazi attraverso immagini capaci di restituire non solo ciò che si vede, ma anche ciò che si vive.",
    "portfolio.title": "GALLERIA PROGETTI",
    "portfolio.ritratto": "Ritratto",
    "portfolio.maternita": "Maternità",
    "portfolio.danza": "Danza",
    "portfolio.racconti": "Racconti",
    "portfolio.giorgia": "Portfolio - Giorgia",
    "portfolio.gabriele": "Portfolio - Gabriele",
    "portfolio.martina": "Portfolio - Martina",
    "portfolio.leonardo": "Portfolio - Leonardo",
    "portfolio.interni-real-estate-firenze": "Interni — Real Estate Firenze",
    "portfolio.interni-b-b-porto-ercole": "Interni — B&B Porto Ercole",
    "contact.title": "CONTATTI",
    "contact.intro": "Per collaborazioni, richieste di informazioni o per prenotare una sessione, compilate il form sottostante o contattatemi direttamente.",
    "form.name": "NOME",
    "form.email": "E-MAIL",
    "form.phone": "TELEFONO",
    "form.location": "LUOGO",
    "form.message": "MESSAGGIO",
    "form.privacy": "Accetto la Privacy Policy",
    "form.privacy.prefix": "Accetto la",
    "form.submit": "INVIA MESSAGGIO",
    "form.success": "Messaggio inviato con successo. Ti risponderò al più presto.",
    "form.error": "Invio non riuscito. Riprova o scrivimi direttamente via email.",
    "form.sending": "Invio…",
    "form.err.name": "Inserisci il nome (minimo 2 caratteri)",
    "form.err.email": "Indirizzo email non valido",
    "form.err.message": "Il messaggio è troppo corto (minimo 10 caratteri)",
    "form.err.privacy": "Devi accettare la Privacy Policy",
    "a11y.skip": "Salta al contenuto",
    "a11y.close": "Chiudi",
    "a11y.prev": "Foto precedente",
    "a11y.next": "Foto successiva",
    "a11y.pause": "Pausa scorrimento",
    "a11y.play": "Riprendi scorrimento",
    "a11y.marquee": "Carosello fotografico",
    "contact.or": "OPPURE",
    "footer.rights": "© 2026 Simona Lascialfari — Tutti i diritti riservati",
    "footer.privacy": "Privacy Policy",
    "footer.cookie": "Cookie Policy",
  },
  en: {
    "nav.home": "HOME",
    "nav.portfolio": "PORTFOLIO",
    "nav.about": "ABOUT",
    "nav.contact": "CONTACT",
    "hero.tagline": "Photographer — Bagno a Ripoli",
    "genre.danza": "Dance",
    "genre.maternita": "Maternity",
    "genre.ritratto": "Portrait",
    "genre.racconti": "Tales",
    "about.title": "ABOUT",
    "about.text": "I am Simona, a photographer based in Bagno a Ripoli. I specialise primarily in portraits, dance photography and maternity photography, fields in which body, movement and emotion take centre stage. Alongside this, I also specialise in interior photography, influenced by my education as an interior designer, which enables me to interpret a space and showcase it through a design-oriented lens. My work stems from a desire to tell stories about people, movement and spaces through images capable of conveying not only what is seen, but also what is experienced.",
    "portfolio.title": "PORTFOLIO",
    "portfolio.ritratto": "Portrait",
    "portfolio.maternita": "Maternity",
    "portfolio.danza": "Dance",
    "portfolio.racconti": "Tales",
    "portfolio.giorgia": "Portfolio - Giorgia",
    "portfolio.gabriele": "Portfolio - Gabriele",
    "portfolio.martina": "Portfolio - Martina",
    "portfolio.leonardo": "Portfolio - Leonardo",
    "portfolio.interni-real-estate-firenze": "Interiors — Real Estate Florence",
    "portfolio.interni-b-b-porto-ercole": "Interiors — B&B Porto Ercole",
    "contact.title": "CONTACT",
    "contact.intro": "For collaborations, inquiries or to book a session, please fill out the form below or contact me directly.",
    "form.name": "NAME",
    "form.email": "E-MAIL",
    "form.phone": "PHONE",
    "form.location": "LOCATION",
    "form.message": "MESSAGE",
    "form.privacy": "I accept the Privacy Policy",
    "form.privacy.prefix": "I accept the",
    "form.submit": "SEND MESSAGE",
    "form.success": "Message sent successfully. I will get back to you soon.",
    "form.error": "Sending failed. Please try again or email me directly.",
    "form.sending": "Sending…",
    "form.err.name": "Enter your name (at least 2 characters)",
    "form.err.email": "Invalid email address",
    "form.err.message": "Message is too short (at least 10 characters)",
    "form.err.privacy": "You must accept the Privacy Policy",
    "a11y.skip": "Skip to content",
    "a11y.close": "Close",
    "a11y.prev": "Previous photo",
    "a11y.next": "Next photo",
    "a11y.pause": "Pause slideshow",
    "a11y.play": "Resume slideshow",
    "a11y.marquee": "Photo carousel",
    "contact.or": "OR",
    "footer.rights": "© 2026 Simona Lascialfari — All rights reserved",
    "footer.privacy": "Privacy Policy",
    "footer.cookie": "Cookie Policy",
  }
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

/** Override runtime dalla homepage gestita (homepage.json): chiave → testo. */
type TextOverrides = { it?: Record<string, string>; en?: Record<string, string> };

export function I18nProvider({
  children,
  overrides,
}: {
  children: React.ReactNode;
  overrides?: TextOverrides;
}) {
  // SSR-safe: localStorage only exists in the browser. First client render
  // matches the server HTML (default "it"), then the saved preference is
  // applied in an effect to avoid hydration mismatch.
  const [language, setLanguage] = useState<Language>("it");

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "it" || saved === "en") setLanguage(saved);
  }, []);

  useEffect(() => {
    try { localStorage.setItem("lang", language); } catch {}
  }, [language]);

  // a11y (WCAG 3.1.2): la voce dello screen reader segue la lingua attiva.
  // Effect-only → SSR-safe (il primo render resta "it" come la shell prerender).
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: string) => {
    // homepage gestita vince (se il valore è testo non vuoto); il resto resta
    // sui contenuti statici — un campo svuotato dall'admin = testo di default
    const ov = overrides?.[language]?.[key];
    if (typeof ov === "string" && ov.length > 0) return ov;
    return translations[language][key as keyof typeof translations["it"]] || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
}

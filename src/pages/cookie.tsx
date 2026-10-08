import { useTranslation } from "@/lib/i18n";
import { Link } from "wouter";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useEffect } from "react";

export default function CookiePolicy() {
  const { language } = useTranslation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const content = language === "it" ? IT : EN;

  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 px-6 md:px-12 max-w-3xl mx-auto py-32 md:py-40 text-foreground">
        <Link href="/" className="text-[10px] tracking-[0.3em] uppercase text-foreground/50 hover:text-foreground transition-colors">
          ← {language === "it" ? "Torna alla home" : "Back to home"}
        </Link>
        <h1 className="text-xs tracking-[0.2em] uppercase mt-12 mb-12">{content.title}</h1>
        <div className="font-serif text-base md:text-lg leading-relaxed text-foreground/80 space-y-6">
          {content.body.map((p, i) =>
            p.h ? (
              <h2 key={i} className="text-[11px] tracking-[0.25em] uppercase text-foreground/60 pt-6 font-sans">
                {p.h}
              </h2>
            ) : (
              <p key={i}>{p.t}</p>
            )
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

const IT = {
  title: "COOKIE POLICY",
  body: [
    { t: "Questa Cookie Policy descrive come e perché vengono utilizzati cookie e tecnologie simili durante la navigazione sul sito www.simonalascialfari.it." },
    { h: "Cosa sono i cookie" },
    { t: "I cookie sono piccoli file di testo che i siti web inviano al dispositivo dell'utente, dove vengono memorizzati per essere ritrasmessi al sito alla visita successiva." },
    { h: "Cookie utilizzati da questo sito" },
    { t: "Questo sito utilizza esclusivamente cookie tecnici di sessione necessari al corretto funzionamento delle pagine (ad esempio per memorizzare la lingua preferita dell'utente). Non sono presenti cookie di profilazione, di marketing né cookie di terze parti per finalità pubblicitarie." },
    { h: "Cookie di terze parti" },
    { t: "Il sito non incorpora script di tracciamento, social plugin con cookie o sistemi di analisi statistica che richiedano consenso. I link esterni a Instagram e WhatsApp aprono i rispettivi servizi in una nuova scheda; eventuali cookie installati sono regolati dalle policy di tali piattaforme." },
    { h: "Gestione delle preferenze" },
    { t: "L'utente può modificare in qualsiasi momento le preferenze relative ai cookie tramite le impostazioni del proprio browser, disattivandoli o eliminando quelli già memorizzati. La disattivazione dei cookie tecnici potrebbe compromettere alcune funzionalità del sito." },
    { h: "Titolare del trattamento" },
    { t: "Simona Lascialfari — Via di Montauto 3, 50012 Bagno a Ripoli (FI). Email: simona.lascialfari.305@gmail.com." },
    { t: "Ultimo aggiornamento: aprile 2026." },
  ],
};

const EN = {
  title: "COOKIE POLICY",
  body: [
    { t: "This Cookie Policy explains how and why cookies and similar technologies are used while browsing www.simonalascialfari.it." },
    { h: "What are cookies" },
    { t: "Cookies are small text files that websites send to the user's device, where they are stored and sent back on subsequent visits." },
    { h: "Cookies used by this site" },
    { t: "This site only uses technical session cookies necessary for the correct operation of the pages (for example to remember the user's preferred language). There are no profiling cookies, marketing cookies or third-party advertising cookies." },
    { h: "Third-party cookies" },
    { t: "The site does not embed tracking scripts, social plugins with cookies or analytics systems that require consent. External links to Instagram and WhatsApp open the respective services in a new tab; any cookies set there are governed by those platforms' policies." },
    { h: "Managing preferences" },
    { t: "You can change your cookie preferences at any time through your browser settings, by disabling them or deleting those already stored. Disabling technical cookies may affect some site features." },
    { h: "Data controller" },
    { t: "Simona Lascialfari — Via di Montauto 3, 50012 Bagno a Ripoli (FI), Italy. Email: simona.lascialfari.305@gmail.com." },
    { t: "Last update: April 2026." },
  ],
};

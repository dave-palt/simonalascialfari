import { useTranslation } from "@/lib/i18n";
import { Link } from "wouter";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useEffect } from "react";

export default function PrivacyPolicy() {
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
  title: "PRIVACY POLICY",
  body: [
    { t: "La presente informativa descrive le modalità di trattamento dei dati personali degli utenti che consultano il sito www.simonalascialfari.it, in conformità al Regolamento UE 2016/679 (GDPR) e al D.lgs. 196/2003 e successive modifiche." },
    { h: "Titolare del trattamento" },
    { t: "Simona Lascialfari — Via di Montauto 3, 50012 Bagno a Ripoli (FI). C.F. LSCSMN94E70D612M. Email: simona.lascialfari.305@gmail.com." },
    { h: "Tipologie di dati raccolti" },
    { t: "I dati raccolti tramite il form di contatto sono: nome, indirizzo email, luogo (facoltativo) e contenuto del messaggio. Il sito non utilizza cookie di profilazione né di terze parti per finalità di marketing." },
    { h: "Finalità del trattamento" },
    { t: "I dati conferiti volontariamente attraverso il form vengono trattati esclusivamente per rispondere alla richiesta dell'utente, fornire informazioni o gestire un eventuale rapporto professionale. Non vengono ceduti a terzi né utilizzati per finalità promozionali." },
    { h: "Base giuridica" },
    { t: "Il trattamento avviene sulla base del consenso espresso dall'utente al momento dell'invio del form (art. 6, par. 1, lett. a GDPR) e per l'esecuzione di misure precontrattuali (art. 6, par. 1, lett. b GDPR)." },
    { h: "Modalità e conservazione" },
    { t: "I dati sono trattati con strumenti elettronici e conservati per il tempo strettamente necessario a evadere la richiesta o gestire il rapporto professionale instaurato. L'invio delle email è gestito attraverso il servizio Resend (Resend, Inc., USA) in qualità di responsabile esterno del trattamento." },
    { h: "Diritti dell'interessato" },
    { t: "L'utente può in ogni momento esercitare i diritti previsti dagli artt. 15-22 del GDPR (accesso, rettifica, cancellazione, limitazione, portabilità, opposizione) scrivendo a simona.lascialfari.305@gmail.com." },
    { h: "Modifiche" },
    { t: "La presente informativa può essere aggiornata in qualsiasi momento. Si invita l'utente a consultare periodicamente questa pagina." },
    { t: "Ultimo aggiornamento: aprile 2026." },
  ],
};

const EN = {
  title: "PRIVACY POLICY",
  body: [
    { t: "This notice describes how personal data of users visiting www.simonalascialfari.it is processed, in compliance with EU Regulation 2016/679 (GDPR) and applicable Italian privacy law." },
    { h: "Data Controller" },
    { t: "Simona Lascialfari — Via di Montauto 3, 50012 Bagno a Ripoli (FI), Italy. Tax ID LSCSMN94E70D612M. Email: simona.lascialfari.305@gmail.com." },
    { h: "Types of data collected" },
    { t: "Data collected through the contact form: name, email address, location (optional) and message content. The site does not use profiling or third-party marketing cookies." },
    { h: "Purpose" },
    { t: "Data voluntarily provided through the form is processed solely to reply to the user's request, provide information, or manage a possible professional relationship. It is never sold or used for promotional purposes." },
    { h: "Legal basis" },
    { t: "Processing is based on the user's consent given when submitting the form (Art. 6(1)(a) GDPR) and on the performance of pre-contractual measures (Art. 6(1)(b) GDPR)." },
    { h: "Storage" },
    { t: "Data is processed using electronic means and retained only for the time strictly necessary to fulfil the request. Email delivery is handled by Resend (Resend, Inc., USA) as a data processor." },
    { h: "Your rights" },
    { t: "Users may exercise the rights set out in Articles 15-22 GDPR (access, rectification, erasure, restriction, portability, objection) by writing to simona.lascialfari.305@gmail.com." },
    { h: "Updates" },
    { t: "This policy may be updated at any time. Please check this page periodically." },
    { t: "Last update: April 2026." },
  ],
};

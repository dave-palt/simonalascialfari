import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "sonner";
import { MotionConfig } from "framer-motion";
import { I18nProvider, useTranslation } from "@/lib/i18n";
import { BASE } from "@/lib/base";
import { useDeviceTheme } from "@/hooks/use-device-theme";
import { useHomepage, HomepageProvider } from "@/hooks/use-homepage";

import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { About } from "@/components/about";
import { Portfolio } from "@/components/portfolio";
import { Contact } from "@/components/contact";
import { Footer } from "@/components/footer";
import NotFound from "@/pages/not-found";
import PrivacyPolicy from "@/pages/privacy";
import CookiePolicy from "@/pages/cookie";

function Home() {
  const { t } = useTranslation();
  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-background">
      {/* a11y (WCAG 2.4.1): skip link, visibile solo al focus da tastiera */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:bg-foreground focus:text-background focus:px-4 focus:py-2 focus:text-xs focus:uppercase focus:tracking-widest"
      >
        {t("a11y.skip")}
      </a>
      <Navbar />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <Hero />
        <About />
        <Portfolio />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/cookie-policy" component={CookiePolicy} />
      <Route component={NotFound} />
    </Switch>
  );
}

// ssrLocation is set only by scripts/prerender.tsx to choose the route
// server-side: a static hook returning [path, noop], no browser APIs.
const ssrHookFor = (path: string) => (() => [path, () => {}]) as any;

function App({ ssrLocation }: { ssrLocation?: string }) {
  useDeviceTheme();
  // homepage gestita: fetch client-only (il prerender usa i testi statici);
  // i testi pubblicati diventano override i18n, le gallerie la griglia portfolio
  const hp = useHomepage();
  const ssrHook = ssrLocation ? ssrHookFor(ssrLocation) : undefined;
  return (
    // a11y: le animazioni framer rispettano prefers-reduced-motion
    <MotionConfig reducedMotion="user">
      <I18nProvider overrides={hp.data?.testi}>
        <HomepageProvider value={hp}>
          <WouterRouter base={BASE.replace(/\/$/, "")} hook={ssrHook}>
            <Router />
          </WouterRouter>
          <Toaster position="bottom-center" toastOptions={{
            style: { background: "hsl(var(--foreground))", color: "hsl(var(--background))", border: "none", borderRadius: 0 }
          }} />
        </HomepageProvider>
      </I18nProvider>
    </MotionConfig>
  );
}

export default App;

import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "sonner";
import { I18nProvider } from "@/lib/i18n";
import { BASE } from "@/lib/base";

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
  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
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
  const ssrHook = ssrLocation ? ssrHookFor(ssrLocation) : undefined;
  return (
    <I18nProvider>
      <WouterRouter base={BASE.replace(/\/$/, "")} hook={ssrHook}>
        <Router />
      </WouterRouter>
      <Toaster position="bottom-center" toastOptions={{
        style: { background: "hsl(var(--foreground))", color: "hsl(var(--background))", border: "none", borderRadius: 0 }
      }} />
    </I18nProvider>
  );
}

export default App;

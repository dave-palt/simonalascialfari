// Contact form endpoint. In dev, Vite proxies /api to the local Worker
// (wrangler dev, port 8787). In production set VITE_CONTACT_ENDPOINT to the
// Worker's public URL (e.g. https://contact.simonalascialfari.it).
export const CONTACT_ENDPOINT: string =
  (import.meta as any).env?.VITE_CONTACT_ENDPOINT || "/api/contact";

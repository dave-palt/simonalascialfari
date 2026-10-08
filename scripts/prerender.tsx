// Prerenders the SPA routes into static HTML at build time.
// Runs AFTER `vite build`: dist/index.html is the bundled shell with hashed
// asset URLs. For each route we render <App ssrLocation=...> with
// react-dom/server and inject the markup into the shell's <div id="root">.
// The client then re-renders with createRoot (no hydration): crawlers and
// no-JS visitors get full HTML, everyone else gets the interactive SPA.
// Run with Bun (resolves TSX and the @/ alias via tsconfig paths).

import { renderToString } from "react-dom/server";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import React from "react";
import App from "../src/App";

const DIST = path.resolve(import.meta.dir, "../dist");
// The wouter Router matches routes against base-prefixed patterns
// (base = VITE_BASE, e.g. "/simonalascialfari" on a GitHub project page),
// so the SSR location must INCLUDE the base prefix. In Bun there is no
// Vite env: read it from process.env (set alongside `vite build` in CI).
const BASE_PREFIX =
  (typeof process !== "undefined" && process.env?.VITE_BASE?.replace(/\/+$/, "")) || "";
const ROUTES: Array<{ path: string; file: string }> = [
  { path: "/", file: "index.html" },
  { path: "/privacy-policy", file: "privacy-policy.html" },
  { path: "/cookie-policy", file: "cookie-policy.html" },
  { path: "/404", file: "404.html" },
];

async function main() {
  const shellPath = path.join(DIST, "index.html");
  const shell = await readFile(shellPath, "utf8");
  if (!shell.includes(`<div id="root"></div>`)) {
    throw new Error('Shell senza <div id="root"></div> — build Vite anomala');
  }

  for (const route of ROUTES) {
    const html = renderToString(
      React.createElement(App, { ssrLocation: BASE_PREFIX + route.path })
    );
    const out = shell.replace(
      `<div id="root"></div>`,
      `<div id="root">${html}</div>`
    );
    await writeFile(path.join(DIST, route.file), out);
    console.log(`prerender: ${route.path} -> dist/${route.file} (${out.length} bytes)`);
  }
  console.log("prerender completato");
}

main();

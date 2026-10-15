// Prerenders the SPA routes into static HTML at build time.
// Runs AFTER `vite build`: dist/index.html is the bundled shell with hashed
// asset URLs. For each route we render <App ssrLocation=...> with
// react-dom/server and inject the markup into the shell's <div id="root">.
// The client then re-renders with createRoot (no hydration): crawlers and
// no-JS visitors get full HTML, everyone else gets the interactive SPA.
// Run with Bun (resolves TSX and the @/ alias via tsconfig paths).
//
// Also inlines the built stylesheet into <head>: the whole bundle is
// ~7 KiB gzipped, so an inline <style> beats a render-blocking <link> and
// the first paint no longer waits for the CSS round-trip. Font files are
// self-hosted (see src/index.css) and the latin subsets get a <preload>.

import { renderToString } from "react-dom/server";
import { readFile, writeFile, rm } from "node:fs/promises";
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
  let shell = await readFile(shellPath, "utf8");
  if (!shell.includes(`<div id="root"></div>`)) {
    throw new Error('Shell senza <div id="root"></div> — build Vite anomala');
  }

  // Inline the stylesheet: replace the Vite-injected <link rel="stylesheet">
  // with the file's content (URLs inside are base-absolute, so they keep
  // working from the document) and preload the latin-subset fonts so the
  // hero text swaps to the real font without waiting for JS or reflow.
  const linkTag = shell.match(/<link rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/);
  if (!linkTag) {
    throw new Error('Shell senza <link rel="stylesheet"> — build Vite anomala');
  }
  const cssRel = BASE_PREFIX ? linkTag[1].slice(BASE_PREFIX.length) : linkTag[1];
  const css = await readFile(path.join(DIST, cssRel), "utf8");
  const fontPreloads = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)]
    .map((m) => m[0])
    .filter((block) => block.includes("U+FFFD")) // latin subset (lightningcss minifies U+0000-00FF to U+??)
    .map((block) => block.match(/url\(([^)]+\.woff2)\)/)?.[1])
    .filter((url): url is string => Boolean(url))
    .map((url) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${url}">`)
    .join("");
  shell = shell.replace(linkTag[0], `${fontPreloads}<style>${css}</style>`);
  await rm(path.join(DIST, cssRel));
  console.log(
    `prerender: css inline (${css.length} bytes) + ${fontPreloads ? "preload font latin" : "nessun preload font"}`
  );

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

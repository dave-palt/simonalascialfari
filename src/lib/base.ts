// Base URL for assets. During `vite build`/dev Vite statically replaces
// import.meta.env.BASE_URL (driven by config `base` / VITE_BASE). The Bun
// prerender script has no Vite env, so it falls back to process.env.VITE_BASE
// (CI and local base-path builds set it alongside `vite build`). Browsers
// have no `process` global — the typeof guard keeps the client bundle safe.
declare const process:
  | { env?: Record<string, string | undefined> }
  | undefined;

export const BASE: string =
  ((import.meta as any).env?.BASE_URL as string | undefined) ||
  (typeof process !== "undefined" ? process.env?.VITE_BASE : undefined) ||
  "/";

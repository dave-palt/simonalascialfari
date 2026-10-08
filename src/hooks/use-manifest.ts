import manifest from "@/generated/manifest.json";

export type Manifest = Record<string, string[]>;

// The manifest is generated at build time by scripts/gen-manifest.ts and
// imported statically: no runtime fetch, available immediately (and during
// server-side prerendering).
export function useManifest(): { manifest: Manifest; loading: boolean } {
  return { manifest: manifest as Manifest, loading: false };
}

// Build-time image pipeline (Bun.Image, zero npm deps). Sources live in
// sources/photos/<slug>/*.jpg (local only, gitignored, NEVER committed or
// published). When sources are present (dev machine, after
// scripts/link-photos.sh) it generates the COMMITTED derivatives (D23):
//   public/photos/.thumbs/<slug>/<n>.webp  — grid/hero previews (800px, q80)
//   public/photos/.full/<slug>/<n>.webp    — lightbox variant (1600px cap, q85)
// plus src/generated/manifest.json.
// When sources are ABSENT but the committed manifest exists (CI), it exits 0:
// derivatives are already in the repo, nothing to regenerate.

import { readdir, mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const SRC_DIR = path.resolve(import.meta.dir, "../sources/photos");
const PUBLIC_PHOTOS = path.resolve(import.meta.dir, "../public/photos");
const THUMBS_DIR = path.join(PUBLIC_PHOTOS, ".thumbs");
const FULL_DIR = path.join(PUBLIC_PHOTOS, ".full");
const GEN_DIR = path.resolve(import.meta.dir, "../src/generated");
const MANIFEST = path.join(GEN_DIR, "manifest.json");

const THUMB_WIDTH = 800;
const FULL_WIDTH = 1600; // demo cap — no high-res in the repo (D23)
const THUMB_QUALITY = 80;
const FULL_QUALITY = 85;

const numeric = (name: string) => {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
};

const webpName = (f: string) => f.replace(/\.[^.]+$/, "") + ".webp";

async function newerThan(
  outPath: string,
  srcStat: Awaited<ReturnType<typeof stat>>
): Promise<boolean> {
  const out = await stat(outPath).catch(() => null);
  return !!out && out.mtimeMs >= srcStat.mtimeMs;
}

async function encode(
  srcPath: string,
  outPath: string,
  opts: { width: number; quality: number }
) {
  const img = new Bun.Image(await Bun.file(srcPath).arrayBuffer());
  const pipeline = img.resize(opts.width, opts.width, {
    fit: "inside",
    withoutEnlargement: true,
  });
  await Bun.write(
    outPath,
    await pipeline.webp({ quality: opts.quality }).bytes()
  );
}

async function ensureVariant(slug: string, file: string): Promise<void> {
  const srcPath = slug
    ? path.join(SRC_DIR, slug, file)
    : path.join(SRC_DIR, file);
  const base = slug || "";
  const srcStat = await stat(srcPath);
  const thumbPath = path.join(THUMBS_DIR, base, webpName(file));
  const fullPath = path.join(FULL_DIR, base, webpName(file));
  const jobs: Promise<void>[] = [];
  if (!(await newerThan(thumbPath, srcStat)))
    jobs.push(
      encode(srcPath, thumbPath, { width: THUMB_WIDTH, quality: THUMB_QUALITY })
    );
  if (!(await newerThan(fullPath, srcStat)))
    jobs.push(
      encode(srcPath, fullPath, { width: FULL_WIDTH, quality: FULL_QUALITY })
    );
  await Promise.all(jobs);
}

async function main() {
  const hasSources = await stat(SRC_DIR)
    .then(() => true)
    .catch(() => false);
  const hasManifest = await stat(MANIFEST)
    .then(() => true)
    .catch(() => false);

  if (!hasSources) {
    if (hasManifest) {
      console.log(
        "manifest: nessuna sorgente locale, uso i derivati già committati (CI) — nulla da generare"
      );
      process.exit(0);
    }
    console.error(
      "Nessuna sorgente in sources/photos e nessun manifest committato — eseguire scripts/link-photos.sh e npm run gen-manifest, poi committare i derivati (D23)."
    );
    process.exit(1);
  }

  const entries = await readdir(SRC_DIR, { withFileTypes: true });
  const manifest: Record<string, string[]> = {};
  let count = 0;
  const t0 = performance.now();

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const files = (await readdir(path.join(SRC_DIR, entry.name)))
        .filter((f) => /\.(jpe?g|png)$/i.test(f))
        .sort((a, b) => numeric(a) - numeric(b));
      if (files.length === 0) continue;
      manifest[entry.name] = files;
      await mkdir(path.join(THUMBS_DIR, entry.name), { recursive: true });
      await mkdir(path.join(FULL_DIR, entry.name), { recursive: true });
      for (const f of files) {
        await ensureVariant(entry.name, f);
        count++;
      }
    } else if (/\.(jpe?g|png)$/i.test(entry.name)) {
      // loose files at the photos root (e.g. simona.jpg portrait)
      await mkdir(THUMBS_DIR, { recursive: true });
      await mkdir(FULL_DIR, { recursive: true });
      await ensureVariant("", entry.name);
      count++;
    }
  }

  if (count === 0) {
    console.error(
      "Nessuna foto in sources/photos — eseguire scripts/link-photos.sh"
    );
    process.exit(1);
  }
  await mkdir(GEN_DIR, { recursive: true });
  await writeFile(
    MANIFEST,
    JSON.stringify(manifest, null, 2) + "\n"
  );
  const total = Object.values(manifest).reduce((n, v) => n + v.length, 0);
  console.log(
    `manifest: ${Object.keys(manifest).length} gallerie, ${total} foto; varianti webp ok (${count} sorgenti, ${((performance.now() - t0) / 1000).toFixed(1)}s)`
  );
}

main();

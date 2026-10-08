import { useTranslation } from "@/lib/i18n";
import { useManifest } from "@/hooks/use-manifest";
import { BASE } from "@/lib/base";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

// WebP thumbnails in the marquee; full-res webp in the lightbox
const fullSrc = (slug: string, file: string) =>
  `${BASE}photos/.full/${slug}/${file.replace(/\.[^.]+$/, ".webp")}`;
const thumbSrc = (slug: string, file: string) =>
  `${BASE}photos/.thumbs/${slug}/${file.replace(/\.[^.]+$/, ".webp")}`;

interface MarqueeItem {
  slug: string;
  file: string;
  label: string;
}

export function Hero() {
  const { t } = useTranslation();
  const { manifest } = useManifest();
  const trackRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScroll: number;
    moved: number;
    horizontal: boolean | null;
  } | null>(null);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const marqueeItems = useMemo<MarqueeItem[]>(() => {
    if (!manifest) return [];
    const items: MarqueeItem[] = [];
    const categories = [
      { slug: "danza", labelKey: "genre.danza" },
      { slug: "maternita", labelKey: "genre.maternita" },
      { slug: "ritratto", labelKey: "genre.ritratto" },
      { slug: "racconti", labelKey: "genre.racconti" },
    ];
    categories.forEach((cat) => {
      const files = manifest[cat.slug] || [];
      files.slice(0, 4).forEach((file) => {
        items.push({ slug: cat.slug, file, label: t(cat.labelKey) });
      });
    });
    return items;
  }, [manifest, t]);

  const loopItems = useMemo(
    () => [...marqueeItems, ...marqueeItems],
    [marqueeItems]
  );

  // Auto-scroll loop
  useEffect(() => {
    if (loopItems.length === 0) return;
    const el = trackRef.current;
    if (!el) return;

    let rafId = 0;
    let last = performance.now();
    let virtual = el.scrollLeft;
    const speed = 70; // px/sec

    const onUserScroll = () => {
      // Sync virtual position when user scrolls/drags so we resume from there
      if (isPausedRef.current) virtual = el.scrollLeft;
    };
    el.addEventListener("scroll", onUserScroll, { passive: true });

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!isPausedRef.current && el.scrollWidth > el.clientWidth) {
        const half = el.scrollWidth / 2;
        virtual += speed * dt;
        if (virtual >= half) virtual -= half;
        el.scrollLeft = virtual;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener("scroll", onUserScroll);
    };
  }, [loopItems]);

  const pauseAndScheduleResume = () => {
    isPausedRef.current = true;
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      isPausedRef.current = false;
    }, 2500);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    isPausedRef.current = true;
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScroll: el.scrollLeft,
      moved: 0,
      horizontal: e.pointerType === "mouse" ? true : null,
    };
    if (e.pointerType === "mouse") {
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const el = trackRef.current;
    if (!drag || !el || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    drag.moved = Math.max(drag.moved, Math.abs(dx), Math.abs(dy));
    if (e.pointerType !== "mouse") {
      // Determine intent on first significant move so vertical gestures
      // can pass through to the page (native touch-action handles this).
      if (drag.horizontal === null) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          drag.horizontal = Math.abs(dx) > Math.abs(dy);
        }
      }
      return; // let native touch scroll work for both axes
    }
    el.scrollLeft = drag.startScroll - dx;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const el = trackRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (el && e.pointerType === "mouse") {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {}
      el.style.cursor = "grab";
    }
    dragStateRef.current = null;
    pauseAndScheduleResume();
  };

  const handleItemClick = (index: number) => {
    const drag = dragStateRef.current;
    if (drag && drag.moved > 5) return;
    if (marqueeItems.length === 0) return;
    setLightboxIndex(index % marqueeItems.length);
    isPausedRef.current = true;
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
    pauseAndScheduleResume();
  };

  const showNext = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    setLightboxIndex((idx) =>
      idx === null || marqueeItems.length === 0
        ? idx
        : (idx + 1) % marqueeItems.length,
    );
  };

  const showPrev = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    setLightboxIndex((idx) =>
      idx === null || marqueeItems.length === 0
        ? idx
        : (idx - 1 + marqueeItems.length) % marqueeItems.length,
    );
  };

  // Auto-close if the index ever points outside the (possibly reloaded) items
  useEffect(() => {
    if (lightboxIndex === null) return;
    if (marqueeItems.length === 0 || lightboxIndex >= marqueeItems.length) {
      setLightboxIndex(null);
    }
  }, [lightboxIndex, marqueeItems.length]);

  const lightboxOpen = lightboxIndex !== null && marqueeItems.length > 0;

  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") showNext();
      if (e.key === "ArrowLeft") showPrev();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen]);

  // Touch swipe for lightbox
  const lightboxTouchStartRef = useRef<number | null>(null);
  const handleLightboxTouchStart = (e: React.TouchEvent) => {
    lightboxTouchStartRef.current = e.targetTouches[0].clientX;
  };
  const handleLightboxTouchEnd = (e: React.TouchEvent) => {
    const start = lightboxTouchStartRef.current;
    if (start === null) return;
    const distance = start - e.changedTouches[0].clientX;
    if (distance > 50) showNext();
    if (distance < -50) showPrev();
    lightboxTouchStartRef.current = null;
  };

  const lightboxItem =
    lightboxIndex !== null ? marqueeItems[lightboxIndex] ?? null : null;

  return (
    <section
      id="hero"
      className="relative min-h-[100dvh] flex flex-col overflow-hidden bg-background pt-48 md:pt-56"
    >
      <div className="flex-1 flex flex-col justify-center items-center px-6 text-center z-10">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="font-serif text-5xl md:text-7xl lg:text-8xl tracking-[0.15em] text-foreground mb-6 font-light"
        >
          SIMONA<br className="md:hidden" /> LASCIALFARI
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="text-sm md:text-base tracking-[0.3em] uppercase text-foreground/70"
        >
          {t("hero.tagline")}
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5, delay: 0.6 }}
        className="w-full py-12 md:py-24"
      >
        {loopItems.length > 0 && (
          <div
            ref={trackRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onMouseEnter={() => {
              isPausedRef.current = true;
            }}
            onMouseLeave={() => {
              if (!dragStateRef.current && !lightboxItem) {
                isPausedRef.current = false;
              }
            }}
            className="flex w-full overflow-x-auto overflow-y-hidden scrollbar-none cursor-grab select-none"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-x pan-y",
            }}
          >
            {loopItems.map((item, i) => (
              <div
                key={i}
                onClick={() => handleItemClick(i % marqueeItems.length)}
                className="relative flex-none w-48 md:w-72 h-72 md:h-96 mx-2 md:mx-4 group"
              >
                <div className="absolute inset-0 bg-background/10 z-10 transition-colors group-hover:bg-transparent duration-500 pointer-events-none" />
                <img
                  src={thumbSrc(item.slug, item.file)}
                  alt={item.label}
                  draggable={false}
                  className="w-full h-full object-cover filter grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-[1.02] pointer-events-none"
                  loading={i < 8 ? "eager" : "lazy"}
                />
                <div className="absolute bottom-4 left-4 z-20 overflow-hidden pointer-events-none">
                  <span className="text-xs uppercase tracking-widest text-background bg-foreground/60 backdrop-blur-sm px-3 py-1 transform translate-y-full group-hover:translate-y-0 transition-transform duration-500 block">
                    {item.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {lightboxItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-12"
            onClick={closeLightbox}
            onTouchStart={handleLightboxTouchStart}
            onTouchEnd={handleLightboxTouchEnd}
          >
            <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-10">
              <span className="text-xs tracking-widest uppercase text-foreground/70">
                {lightboxItem.label}
              </span>
              <div className="flex items-center gap-6">
                <span className="text-xs font-mono text-foreground/50">
                  {(lightboxIndex ?? 0) + 1} / {marqueeItems.length}
                </span>
                <button
                  onClick={closeLightbox}
                  aria-label="Close"
                  className="p-2 text-foreground/70 hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.img
                key={`${lightboxItem.slug}-${lightboxItem.file}`}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.3 }}
                src={fullSrc(lightboxItem.slug, lightboxItem.file)}
                alt={lightboxItem.label}
                className="max-w-full max-h-full object-contain shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            </AnimatePresence>

            <button
              aria-label="Previous image"
              onClick={showPrev}
              className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 p-3 md:p-4 text-foreground/70 hover:text-foreground transition-opacity"
            >
              <ChevronLeft className="w-8 h-8 md:w-10 md:h-10" strokeWidth={1.5} />
            </button>
            <button
              aria-label="Next image"
              onClick={showNext}
              className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 p-3 md:p-4 text-foreground/70 hover:text-foreground transition-opacity"
            >
              <ChevronRight className="w-8 h-8 md:w-10 md:h-10" strokeWidth={1.5} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

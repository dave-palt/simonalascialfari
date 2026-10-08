import { useTranslation } from "@/lib/i18n";
import { useManifest } from "@/hooks/use-manifest";
import { BASE } from "@/lib/base";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

// Originals (full-res webp) in the lightbox; thumbnails in the grid
const fullSrc = (slug: string, file: string) =>
  `${BASE}photos/.full/${slug}/${file.replace(/\.[^.]+$/, ".webp")}`;
const thumbSrc = (slug: string, file: string) =>
  `${BASE}photos/.thumbs/${slug}/${file.replace(/\.[^.]+$/, ".webp")}`;

const PROJECTS = [
  { slug: "ritratto", labelKey: "portfolio.ritratto" },
  { slug: "maternita", labelKey: "portfolio.maternita" },
  { slug: "danza", labelKey: "portfolio.danza" },
  { slug: "racconti", labelKey: "portfolio.racconti" },
  { slug: "portfolio-giorgia", labelKey: "portfolio.giorgia" },
  { slug: "portfolio-gabriele", labelKey: "portfolio.gabriele" },
  { slug: "portfolio-martina", labelKey: "portfolio.martina" },
  { slug: "portfolio-leonardo", labelKey: "portfolio.leonardo" },
  { slug: "interni-real-estate-firenze", labelKey: "portfolio.interni-real-estate-firenze" },
  { slug: "interni-b-b-porto-ercole", labelKey: "portfolio.interni-b-b-porto-ercole" },
];

export function Portfolio() {
  const { t } = useTranslation();
  const { manifest } = useManifest();
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const openLightbox = (slug: string) => {
    setActiveProject(slug);
    setCurrentImageIndex(0);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setActiveProject(null);
    document.body.style.overflow = '';
  };

  const activeImages = activeProject && manifest ? manifest[activeProject] || [] : [];

  const nextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (activeImages.length > 0) {
      setCurrentImageIndex((prev) => (prev + 1) % activeImages.length);
    }
  };

  const prevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (activeImages.length > 0) {
      setCurrentImageIndex((prev) => (prev - 1 + activeImages.length) % activeImages.length);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeProject) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") nextImage();
      if (e.key === "ArrowLeft") prevImage();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeProject, activeImages.length]);

  // Touch swipe handling
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.targetTouches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touchEnd = e.changedTouches[0].clientX;
    const distance = touchStart - touchEnd;
    if (distance > 50) nextImage();
    if (distance < -50) prevImage();
    setTouchStart(null);
  };

  return (
    <section id="portfolio" className="py-24 md:py-40 bg-card text-card-foreground">
      <div className="px-6 md:px-12 max-w-[1600px] mx-auto flex flex-col items-center mb-16 md:mb-24">
        <h2 className="text-xs md:text-sm tracking-[0.2em] uppercase">{t("portfolio.title")}</h2>
        <div className="w-px h-12 bg-foreground/20 mt-6" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1 px-1">
        {manifest && PROJECTS.map((project, index) => {
          const coverImage = manifest[project.slug]?.[0];
          if (!coverImage) return null;

          return (
            <motion.div
              key={project.slug}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.8, delay: (index % 4) * 0.1 }}
              className="relative aspect-square cursor-pointer group overflow-hidden bg-muted"
              onClick={() => openLightbox(project.slug)}
            >
              <img
                src={thumbSrc(project.slug, coverImage)}
                alt={t(project.labelKey)}
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-500 flex items-end p-3 md:p-6">
                <span className="text-white text-[10px] md:text-sm tracking-[0.1em] uppercase font-medium leading-tight">
                  {t(project.labelKey)}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {activeProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex flex-col"
            onClick={closeLightbox}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Header */}
            <div className="absolute top-0 w-full p-6 flex justify-between items-center z-10">
              <span className="text-xs tracking-widest uppercase text-foreground/70">
                {t(PROJECTS.find(p => p.slug === activeProject)?.labelKey || "")}
              </span>
              <div className="flex items-center gap-6">
                <span className="text-xs font-mono text-foreground/50">
                  {currentImageIndex + 1} / {activeImages.length}
                </span>
                <button 
                  onClick={closeLightbox}
                  className="p-2 hover:bg-foreground/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-foreground/70" />
                </button>
              </div>
            </div>

            {/* Main Image */}
            <div className="flex-1 flex items-center justify-center p-4 md:p-16 relative overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.img
                  key={`${activeProject}-${currentImageIndex}`}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  src={fullSrc(activeProject, activeImages[currentImageIndex])}
                  className="max-w-full max-h-full object-contain shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                />
              </AnimatePresence>

              {/* Navigation Arrows */}
              <button
                aria-label="Previous image"
                className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-4 text-black hover:opacity-70 transition-opacity"
                onClick={prevImage}
              >
                <ChevronLeft className="w-12 h-12" strokeWidth={1.5} />
              </button>
              <button
                aria-label="Next image"
                className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-4 text-black hover:opacity-70 transition-opacity"
                onClick={nextImage}
              >
                <ChevronRight className="w-12 h-12" strokeWidth={1.5} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

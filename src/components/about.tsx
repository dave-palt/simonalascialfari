import { useTranslation } from "@/lib/i18n";
import { BASE } from "@/lib/base";
import { motion } from "framer-motion";

export function About() {
  const { t } = useTranslation();

  const portraitImage = `${BASE}photos/.full/simona.webp`;

  return (
    <section id="about" className="py-24 md:py-40 px-6 md:px-12 max-w-7xl mx-auto bg-background">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-24 items-center">
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="md:col-span-5 aspect-[3/4] relative overflow-hidden"
        >
          {portraitImage && (
            <img 
              src={portraitImage} 
              alt="Simona Lascialfari" 
              className="w-full h-full object-cover filter grayscale"
              loading="lazy"
            />
          )}
          {/* Subtle border to frame the image in the editorial style */}
          <div className="absolute inset-0 border border-foreground/10 pointer-events-none" />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="md:col-span-7 flex flex-col justify-center"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-px bg-foreground" />
            <h2 className="text-sm tracking-[0.2em] uppercase text-foreground">{t("about.title")}</h2>
          </div>
          
          <div className="font-serif text-xl md:text-2xl lg:text-3xl leading-relaxed md:leading-relaxed text-foreground/90 font-light">
            {t("about.text").split('\n').map((paragraph, i) => (
              <p key={i} className="mb-6 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  );
}

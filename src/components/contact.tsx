import { useTranslation } from "@/lib/i18n";
import { CONTACT_ENDPOINT } from "@/lib/contact-endpoint";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Link } from "wouter";

const formSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  location: z.string().optional(),
  message: z.string().min(10, "Message is too short"),
  privacy: z.literal(true, {
    errorMap: () => ({ message: "You must accept the privacy policy" }),
  }),
  company: z.string().max(0).optional(), // honeypot: must stay empty
});

type FormValues = z.infer<typeof formSchema>;

export function Contact() {
  const { t } = useTranslation();
  
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });
  const privacyChecked = watch("privacy");

  const onSubmit = async (data: FormValues) => {
    // Honeypot: bots filling the hidden "company" field are rejected silently
    if (data.company) {
      toast.success(t("form.success"));
      reset();
      return;
    }
    try {
      const res = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone ?? "",
          location: data.location ?? "",
          message: data.message,
        }),
      });
      if (!res.ok) throw new Error("send_failed");
      toast.success(t("form.success"));
      reset();
    } catch {
      toast.error(t("form.error"));
    }
  };

  return (
    <section id="contact" className="py-24 md:py-40 px-6 md:px-12 max-w-4xl mx-auto bg-background text-foreground">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="text-center mb-16"
      >
        <h2 className="text-xs tracking-[0.2em] uppercase mb-8">{t("contact.title")}</h2>
        <p className="font-serif text-xl md:text-2xl text-foreground/80 max-w-2xl mx-auto font-light leading-relaxed">
          {t("contact.intro")}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* honeypot anti-spam: hidden from users, bots fill it */}
          <input
            type="text"
            {...register("company")}
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
            style={{ position: "absolute", left: "-9999px", top: "auto" }}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] tracking-widest uppercase text-foreground/60">{t("form.name")}</label>
              <input 
                {...register("name")} 
                className="w-full bg-transparent border-b border-border/50 py-3 text-foreground focus:outline-none focus:border-foreground transition-colors font-serif text-lg"
              />
              {errors.name && <span className="text-accent text-xs">{errors.name.message}</span>}
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] tracking-widest uppercase text-foreground/60">{t("form.email")}</label>
              <input 
                {...register("email")} 
                type="email"
                className="w-full bg-transparent border-b border-border/50 py-3 text-foreground focus:outline-none focus:border-foreground transition-colors font-serif text-lg"
              />
              {errors.email && <span className="text-accent text-xs">{errors.email.message}</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] tracking-widest uppercase text-foreground/60">{t("form.phone")}</label>
              <input
                {...register("phone")}
                type="tel"
                className="w-full bg-transparent border-b border-border/50 py-3 text-foreground focus:outline-none focus:border-foreground transition-colors font-serif text-lg"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] tracking-widest uppercase text-foreground/60">{t("form.location")}</label>
              <input
                {...register("location")}
                className="w-full bg-transparent border-b border-border/50 py-3 text-foreground focus:outline-none focus:border-foreground transition-colors font-serif text-lg"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] tracking-widest uppercase text-foreground/60">{t("form.message")}</label>
            <textarea 
              {...register("message")} 
              rows={4}
              className="w-full bg-transparent border-b border-border/50 py-3 text-foreground focus:outline-none focus:border-foreground transition-colors font-serif text-lg resize-none"
            />
            {errors.message && <span className="text-accent text-xs">{errors.message.message}</span>}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pt-4">
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-3 cursor-pointer group select-none">
                <div className="relative flex items-center justify-center w-4 h-4 border border-foreground/40 group-hover:border-foreground transition-colors">
                  <input
                    type="checkbox"
                    {...register("privacy")}
                    className="opacity-0 absolute inset-0 cursor-pointer"
                  />
                  <motion.div
                    initial={false}
                    animate={{ scale: privacyChecked ? 1 : 0 }}
                    transition={{ duration: 0.15 }}
                    className="w-2 h-2 bg-foreground"
                  />
                </div>
                <span className="text-xs uppercase tracking-widest text-foreground/60 group-hover:text-foreground transition-colors">
                  {t("form.privacy.prefix")}{" "}
                  <Link
                    href="/privacy-policy"
                    onClick={(e) => e.stopPropagation()}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    {t("footer.privacy")}
                  </Link>
                </span>
              </label>
              {errors.privacy && <span className="text-accent text-xs">{errors.privacy.message}</span>}
            </div>

            <button 
              type="submit" 
              disabled={isSubmitting}
              className="text-xs uppercase tracking-widest bg-foreground text-background px-8 py-4 hover:bg-foreground/90 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "..." : t("form.submit")}
            </button>
          </div>
        </form>

        <div className="mt-24 pt-24 border-t border-border/30 text-center">
          <span className="text-[10px] tracking-[0.3em] uppercase text-foreground/40 block mb-12 relative">
            <span className="bg-background px-4 relative z-10">{t("contact.or")}</span>
            <div className="absolute top-1/2 left-0 right-0 h-px bg-border/30 -z-0" />
          </span>
          
          <div className="space-y-4 font-serif text-lg md:text-xl text-foreground/80">
            <p className="font-semibold text-foreground">Simona Lascialfari</p>
            <p><a href="mailto:simona.lascialfari.305@gmail.com" className="hover:text-accent transition-colors">simona.lascialfari.305@gmail.com</a></p>
            <p className="flex items-center justify-center gap-2">
              <a
                href="https://wa.me/393315874486"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="inline-flex items-center gap-2 hover:text-accent transition-colors"
              >
                <svg viewBox="0 0 32 32" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                  <path d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39a.63.63 0 0 1-.315-.1c-.802-.402-1.504-.817-2.163-1.447-.545-.516-1.146-1.29-1.46-1.963a.426.426 0 0 1-.073-.215c0-.33.99-.945.99-1.49 0-.143-.73-2.09-.832-2.335-.143-.372-.214-.487-.6-.487-.187 0-.36-.043-.53-.043-.302 0-.53.115-.746.315-.688.645-1.032 1.318-1.06 2.264v.114c-.015.99.472 1.977 1.017 2.792 1.23 1.82 2.81 3.41 4.74 4.54.616.355 2.137 1.075 2.808 1.075h.013c.671 0 2.062-.673 2.43-1.433.15-.302.225-.674.225-1.017 0-.156-.058-.314-.103-.43-.157-.297-1.62-.987-1.823-1.075zM16.32 26.69c-1.93 0-3.81-.534-5.45-1.554l-3.81 1.218 1.246-3.682a10.27 10.27 0 0 1-1.78-5.788c0-5.69 4.62-10.31 10.31-10.31a10.24 10.24 0 0 1 7.293 3.018 10.24 10.24 0 0 1 3.017 7.293c0 5.69-4.62 10.31-10.31 10.31zm0-22.598c-6.81 0-12.34 5.532-12.34 12.34a12.36 12.36 0 0 0 1.696 6.243L4 32l5.5-1.756a12.31 12.31 0 0 0 6.815 2.06c6.81 0 12.34-5.531 12.34-12.341S23.13 4.092 16.32 4.092z"/>
                </svg>
                WhatsApp +39 331 587 4486
              </a>
            </p>
            <p className="pt-4">
              <a href="https://www.instagram.com/seemorea_photography/" target="_blank" rel="noopener noreferrer" className="text-sm font-sans tracking-widest uppercase hover:text-accent transition-colors border-b border-transparent hover:border-accent">
                Instagram
              </a>
            </p>
          </div>

          <div className="mt-12 space-y-1 text-[10px] tracking-widest uppercase text-foreground/40 font-sans">
            <p>Via di Montauto 3 — 50012 — Bagno a Ripoli (FI)</p>
            <p>C.F. LSCSMN94E70D612M</p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

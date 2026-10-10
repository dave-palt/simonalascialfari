// Cloudflare Worker: POST /api/contact -> Resend email.
// Deploy: cd worker && npm run worker:deploy (wrangler, from repo root).
// Secrets (wrangler secret put): RESEND_API_KEY
// Vars in wrangler.toml: CONTACT_FROM, CONTACT_TO, SITE_ORIGIN

export interface Env {
  RESEND_API_KEY: string;
  CONTACT_FROM: string;
  CONTACT_TO: string;
  SITE_ORIGIN: string;
  RATE_LIMITER: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>;
  };
}

const json = (body: unknown, status = 200, origin = "*") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });

const validString = (value: unknown, min: number, max: number) =>
  typeof value === "string" && value.trim().length >= min && value.length <= max;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({}, 204, env.SITE_ORIGIN);
    }
    if (url.pathname !== "/api/contact") {
      return json({ error: "not_found" }, 404);
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    // CORS: only the configured site origin may call
    const origin = request.headers.get("Origin");
    if (env.SITE_ORIGIN && origin && origin !== env.SITE_ORIGIN) {
      return json({ error: "origin_not_allowed" }, 403);
    }

    // Rate limit: 10 requests / 10 min per IP via Workers Rate Limiting
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return json({ error: "too_many_requests" }, 429);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.startsWith("application/json")) {
      return json({ error: "json_required" }, 415);
    }

    let data: any;
    try {
      data = await request.json();
    } catch {
      return json({ error: "invalid_payload" }, 400);
    }

    // Honeypot: silently accept bot submissions
    if (typeof data.company === "string" && data.company.length > 0) {
      return json({ ok: true });
    }

    if (
      !data ||
      !validString(data.name, 2, 200) ||
      !validString(data.email, 3, 200) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
      !validString(data.message, 10, 5000) ||
      !validString(data.phone ?? "", 0, 50) ||
      !validString(data.location ?? "", 0, 200)
    ) {
      return json({ error: "invalid_payload" }, 400);
    }

    if (!env.RESEND_API_KEY) {
      return json({ error: "email_not_configured" }, 503);
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.CONTACT_FROM || "Simona Lascialfari <noreply@simonalascialfari.com>",
          to: [env.CONTACT_TO || "simona.lascialfari.305@gmail.com"],
          reply_to: data.email,
          subject: `Nuovo messaggio dal sito — ${data.name.replace(/[\r\n]/g, " ")}`,
          text: `Nome: ${data.name}\nEmail: ${data.email}\nTelefono: ${data.phone || "—"}\nLuogo: ${data.location || "—"}\n\n${data.message}`,
        }),
      });
      if (!response.ok) {
        // Include Resend's HTTP status for diagnostics (no body: could leak).
        return json({ error: "send_failed", resend_status: response.status }, 502);
      }
      return json({ ok: true });
    } catch {
      return json({ error: "send_failed" }, 502);
    }
  },
};

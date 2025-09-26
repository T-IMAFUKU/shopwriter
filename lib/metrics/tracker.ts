/* ============================================================================
 * ShopWriter 窶・Metrics Tracker (髮帛ｽ｢)
 * File: lib/metrics/tracker.ts  竊・譁ｰ隕・
 * Role: 繝ｩ繝ｳ繧ｿ繧､繝縺ｫ萓晏ｭ倥＠縺ｪ縺・窶懷ｮ牙・繝ｻ辟｡螳ｳ窶・縺ｪ險域ｸｬ蜻ｼ縺ｳ蜃ｺ縺怜哨繧呈署萓・
 *
 * 險ｭ險域婿驥・
 * - 螟ｱ謨励＠縺ｦ繧ゅい繝励Μ繧呈ｭ｢繧√↑縺・ｼ亥ｮ悟・ non-blocking / best-effort・・
 * - PII 繧呈桶繧上↑縺・ｼ医ワ繝・す繝･遲峨〒譛蟆城剞・・
 * - 迺ｰ蠅・､画焚縺ｧ騾∽ｿ｡ON/OFF繧貞宛蠕｡・・ETRICS_ENABLED, METRICS_WEBHOOK_URL・・
 * - Node/Edge/Browser 縺・★繧後〒繧ょ虚縺・fetch 繝吶・繧ｹ
 * - Vitest 縺ｧ縺ｯ閾ｪ蜍慕噪縺ｫ NO-OP・医せ繝翫ャ繝励す繝ｧ繝・ヨ縺ｮ螳牙ｮ壽ｧ繧堤｢ｺ菫晢ｼ・
 * ========================================================================== */

export type WriterMetricEvent = {
  kind: "writer_complete" | "writer_error";
  /** 螳溯｡後Δ繝ｼ繝・ fake/openai */
  mode: "fake" | "openai";
  /** 菴ｿ逕ｨ繝｢繝・Ν・井ｾ・ gpt-4o-mini / unknown・・*/
  model?: string;
  /** 謇隕∵凾髢・ms) */
  durationMs?: number;
  /** 蜈･蜉帑ｻ墓ｧ倥ワ繝・す繝･・・II繧貞性縺ｾ縺ｪ縺・洒縺・ｭ伜挨蟄撰ｼ・*/
  inputSig?: string;
  /** 邨先棡髟ｷ縺包ｼ域枚蟄玲焚・・*/
  outputLen?: number;
  /** 繧ｨ繝ｩ繝ｼ蜀・ｮｹ・・ind=writer_error 縺ｮ譎ゅ・縺ｿ・・*/
  errorMessage?: string;
  /** 莉ｻ諢上Γ繧ｿ */
  meta?: Record<string, string | number | boolean | null | undefined>;
};

/** 險ｭ螳夲ｼ夂腸蠅・､画焚縺九ｉ隱ｭ縺ｿ霎ｼ繧・・ercel/繝ｭ繝ｼ繧ｫ繝ｫ荳｡蟇ｾ蠢懶ｼ・*/
function getConfig() {
  const enabled =
    (process.env.METRICS_ENABLED ?? "").toLowerCase() === "true" &&
    !!process.env.METRICS_WEBHOOK_URL;

  return {
    enabled,
    webhookUrl: process.env.METRICS_WEBHOOK_URL,
    app: process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.NEXT_PUBLIC_APP_URL || "local",
    env:
      process.env.VERCEL_ENV ||
      process.env.NODE_ENV ||
      "development",
    debug: (process.env.METRICS_DEBUG ?? "").toLowerCase() === "true",
  };
}

/** 螳牙・縺ｪ遏ｭ邵ｮ繝上ャ繧ｷ繝･・・II蝗樣∩繝ｻ繝ｩ繝ｳ繧ｿ繧､繝萓晏ｭ倥↑縺暦ｼ・*/
export function tinyHash(input: unknown): string {
  try {
    const s = typeof input === "string" ? input : JSON.stringify(input);
    // Fowler窶哲oll窶天o (FNV-1a) 32-bit 逧・↑霆ｽ驥上ワ繝・す繝･
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
      h >>>= 0;
    }
    return h.toString(16);
  } catch {
    return "na";
  }
}

/** 螳滄∽ｿ｡・・etch・峨ょ､ｱ謨励＠縺ｦ繧ゆｾ句､悶ｒ謚輔￡縺ｪ縺・*/
async function postMetric(url: string, payload: Record<string, any>, debug = false) {
  try {
    // Edge/Node/Browser 縺・★繧後〒繧・fetch 縺ｯ繧ｰ繝ｭ繝ｼ繝舌Ν縺ｫ蟄伜惠縺吶ｋ諠ｳ螳・
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (debug) {
      // 謌仙凄蝠上ｏ縺壹せ繝・・繧ｿ繧ｹ縺縺大・縺・
      // eslint-disable-next-line no-console
      console.log("[metrics] sent", res.status);
    }
  } catch (e) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[metrics] failed", (e as Error)?.message);
    }
  }
}

/** 繝｡繧､繝ｳ・啗riter邉ｻ繧､繝吶Φ繝磯∽ｿ｡・・O-OP繧ｻ繝ｼ繝包ｼ・*/
export async function trackWriterEvent(ev: WriterMetricEvent): Promise<void> {
  // Vitest/繝・せ繝域凾縺ｯ蟶ｸ縺ｫ NO-OP
  if (process.env.NODE_ENV === "test") return;

  const cfg = getConfig();
  if (!cfg.enabled || !cfg.webhookUrl) {
    if (cfg.debug) {
      // eslint-disable-next-line no-console
      console.log("[metrics] disabled", { enabled: cfg.enabled, hasUrl: !!cfg.webhookUrl });
    }
    return;
  }

  const payload = {
    ts: new Date().toISOString(),
    app: cfg.app,
    env: cfg.env,
    kind: ev.kind,
    mode: ev.mode,
    model: ev.model ?? "unknown",
    durationMs: ev.durationMs ?? null,
    inputSig: ev.inputSig ?? null,
    outputLen: ev.outputLen ?? null,
    meta: ev.meta ?? {},
  };

  await postMetric(cfg.webhookUrl, payload, cfg.debug);
}

/* --------------------------------------------------------------------------
 * 菴ｿ縺・婿・井ｾ具ｼ・窶・app/api/writer/route.ts 縺九ｉ:
 *
 * const t0 = performance.now();
 * // ... 逕滓・蜃ｦ逅・...
 * await trackWriterEvent({
 *   kind: "writer_complete",
 *   mode: isFakeMode ? "fake" : "openai",
 *   model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
 *   durationMs: Math.round(performance.now() - t0),
 *   inputSig: tinyHash({ style: parsed.style, tone: parsed.tone, locale: parsed.locale }),
 *   outputLen: text.length,
 *   meta: { route: "/api/writer" },
 * });
 *
 * - METRICS_ENABLED=true 縺ｨ METRICS_WEBHOOK_URL 繧定ｨｭ螳壹☆繧九→騾∽ｿ｡髢句ｧ・
 * - 險ｭ螳壹′辟｡縺代ｌ縺ｰ NO-OP・医い繝励Μ縺ｫ蠖ｱ髻ｿ縺ｪ縺暦ｼ・
 * -------------------------------------------------------------------------- */

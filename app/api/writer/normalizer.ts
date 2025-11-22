/** app/api/writer/normalizer.ts
 * Phase C9: Normalizer 抽出
 * - JSON/自由文を NormalizedInput に正規化するレイヤー
 * - 挙動は route.ts 内の normalizeInput / coerceToShape と完全に一致させる
 */

export type NormalizedInput = {
  product_name: string;
  category: string;
  goal: string;
  audience: string;
  platform?: string | null;
  keywords: string[];
  constraints: string[];
  brand_voice?: string | null;
  tone?: string | null;
  style?: string | null;
  length_hint?: string | null;
  selling_points: string[];
  objections: string[];
  evidence: string[];
  cta_preference: string[];
  _raw?: string;
};

// JSON/自由文を NormalizedInput に揃える
export function normalizeInput(raw: string | undefined): NormalizedInput {
  const txt = (raw ?? "").toString().trim();

  // 1) JSONとみなせるなら優先してJSON parse
  if (txt.startsWith("{") || txt.startsWith("[")) {
    try {
      const j = JSON.parse(txt);
      const obj = Array.isArray(j) ? j[0] ?? {} : j ?? {};
      return coerceToShape(obj, txt);
    } catch {
      // JSONじゃなかったときはフォールバック
    }
  }

  const lower = txt.toLowerCase();
  const pick = (re: RegExp, def = "") => {
    const m = re.exec(txt);
    return (m?.[1] ?? def).toString().trim();
  };

  const category = pick(/カテゴリ[：:]\s*(.+)/i, "");
  const goal = pick(/目的[：:]\s*(.+)/i, "");
  const audience = pick(/ターゲット[：:]\s*(.+)/i, "");
  const platform =
    pick(/媒体[：:]\s*(.+)/i, "") ||
    (/(lp|ランディングページ)/i.test(lower) ? "lp" : null);

  const keywordsMatch = txt.match(/キーワード[：:]\s*(.+)/i);
  const keywords =
    keywordsMatch?.[1]
      ?.split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const constraintsMatch = txt.match(/制約条件[：:]\s*(.+)/i);
  const constraints =
    constraintsMatch?.[1]
      ?.split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const sellingPointsMatch = txt.match(/セールスポイント[：:]\s*(.+)/i);
  const selling_points =
    sellingPointsMatch?.[1]
      ?.split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const objectionsMatch = txt.match(/よくある不安[：:]\s*(.+)/i);
  const objections =
    objectionsMatch?.[1]
      ?.split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const evidenceMatch = txt.match(/根拠[：:]\s*(.+)/i);
  const evidence =
    evidenceMatch?.[1]
      ?.split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const ctaPrefMatch = txt.match(/CTA希望[：:]\s*(.+)/i);
  const cta_preference =
    ctaPrefMatch?.[1]
      ?.split(/[、,]/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  return coerceToShape(
    {
      product_name: pick(/商品名[：:]\s*(.+)/i, ""),
      category,
      goal,
      audience,
      platform,
      keywords,
      constraints,
      brand_voice: pick(/ブランドボイス[：:]\s*(.+)/i, ""),
      tone: pick(/トーン[：:]\s*(.+)/i, ""),
      style: pick(/スタイル[：:]\s*(.+)/i, ""),
      length_hint: pick(/ボリューム[：:]\s*(.+)/i, ""),
      selling_points,
      objections,
      evidence,
      cta_preference,
    },
    txt,
  );
}

// 任意オブジェクトを NormalizedInput shape に寄せる
function coerceToShape(obj: any, raw: string): NormalizedInput {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const arr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map((x) => String(x)).filter((x) => x.trim().length > 0)
      : typeof v === "string"
        ? v
            .split(/[、,]/)
            .map((x) => x.trim())
            .filter(Boolean)
        : [];

  return {
    product_name: s(obj.product_name || obj.title || obj.name),
    category: s(obj.category),
    goal: s(obj.goal),
    audience: s(obj.audience),
    platform: obj.platform ? String(obj.platform) : null,
    keywords: arr(obj.keywords),
    constraints: arr(obj.constraints),
    brand_voice: obj.brand_voice ? String(obj.brand_voice) : null,
    tone: obj.tone ? String(obj.tone) : null,
    style: obj.style ? String(obj.style) : null,
    length_hint: obj.length_hint ? String(obj.length_hint) : null,
    selling_points: arr(obj.selling_points),
    objections: arr(obj.objections),
    evidence: arr(obj.evidence),
    cta_preference: arr(obj.cta_preference),
    _raw: raw,
  };
}

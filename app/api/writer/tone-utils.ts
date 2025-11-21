// app/api/writer/tone-utils.ts

import { tonePresets } from "./_shared/tone-presets";

/* =========================
   Tone Preset ユーティリティ
   - lib/tone-presets.ts の内容を参照し、入力 tone/style から解決
   - 無指定時は "warm_intelligent" を既定
========================= */

export type TonePreset = {
  system?: string;
  guidelines?: string[];
  aliases?: string[];
};

function safeLower(s: string | null | undefined) {
  return (s ?? "").toString().trim().toLowerCase();
}

export function resolveTonePresetKey(
  inputTone?: string | null,
  inputStyle?: string | null,
): string {
  const wanted = safeLower(inputTone) || safeLower(inputStyle) || "";
  const keys = Object.keys(tonePresets ?? {});
  if (!keys.length) return "warm_intelligent";

  if (wanted && keys.includes(wanted)) return wanted;

  for (const k of keys) {
    const p = (tonePresets as Record<string, TonePreset>)[k] as TonePreset;
    const aliases = (p?.guidelines ?? []).map(safeLower);
    if (aliases.includes(wanted)) return k;
  }

  if (wanted) {
    for (const k of keys) {
      if (wanted.includes(k)) return k;
    }
  }

  return "warm_intelligent";
}

export function renderToneModule(toneKey: string): string {
  const p = (tonePresets as Record<string, TonePreset>)[toneKey] as
    | TonePreset
    | undefined;
  if (!p)
    return `【トーン】${toneKey}：落ち着いた知性と誠実さを保ち、読み手を尊重する。`;
  const head = `【トーン】${toneKey}`;
  const sys = p.system ? `${p.system}` : "";
  const gl =
    (p.guidelines ?? []).length
      ? "\n" + (p.guidelines as string[]).map((g) => `- ${g}`).join("\n")
      : "";
  return `${head}\n${sys}${gl}`.trim();
}

/* =========================
   System Prompt（Precision Plan想定の最終仕様 + Tone統合）
========================= */

export function buildSystemPrompt(opts: {
  overrides?: string;
  toneKey: string;
}): string {
  const { overrides, toneKey } = opts;
  if (overrides && overrides.trim().length > 0) return overrides + "";

  const toneModule = renderToneModule(toneKey);

  const modules = [
    toneModule,
    "あなたはEC特化の日本語コピーライターAIです。敬体（です・ます）で、落ち着いた知性を保ち、読み手を尊重します。感情的な煽りや誇大広告は避け、事実ベースで具体的に伝えます。読み手に急いで行動を迫る、押し売り調の見出し（例:「さあ、今すぐ〜」など）は避け、穏やかに案内してください。",
    "媒体と目的に応じて、ヘッドライン→概要→特長やベネフィット→根拠/比較→FAQ→CTAの流れで整理してください。見出しは最大でもH2までにします。箇条書きは3〜7項目を目安にします。",
    "不自然なキーワード羅列は禁止です。単語の詰め込みではなく、自然な言い換え・共起語を使ってください。タイトルは目安32字、説明文は80〜120字程度を参考にします（厳密でなくて構いません）。",
    "一次CTAは購入や申し込みなど主目的に直結した行動を促してください。代替CTAは低負荷の行動（カート追加や比較検討など）を提案します。それぞれ『その行動をすると何が得られるか』『どんな不安が下がるか』まで説明してください。ただし過度な断定は避け、落ち着いた表現で書きます。",
    "医薬的効能の断定、根拠のないNo.1表現、過度な断言、感嘆符（！）の多用は禁止です。保証・返品・相性に関する不安はFAQやCTAで事前にケアします。",
    "文章は完成した読みものとして出力してください。必要に応じてH2や箇条書きを使い、読み手が購入前に知りたい実用的な情報（サイズ、容量、時間、回数など数値付き）を最低2つ入れてください。",
    "文末近くでFAQをQ&A形式（2〜3問）で提示し、その後に一次CTAと代替CTAを1行ずつ示してください。FAQやCTAはそれぞれ1ブロックずつにまとめてください。重複させないでください。",
    "【厳格条件】感嘆符（！）は使用しません。語尾・表記揺れ・冗長な繰り返しは整えてください。文体は 'です・ます' で統一します。",
    "ユーザーが指定した商品・サービス・店舗・ブランド名をそのまま用い、別の名前や別の商品に置き換えないでください。固有名詞を別の企業名や別ブランド名に差し替えたり、別の商品に飛び換えたりしないでください。たとえば「アイン薬局」と指定された場合は必ず「アイン薬局」という表記を用い、その企業やサービスを正しく主語にしてください。",
  ];

  return modules.join("\n\n");
}

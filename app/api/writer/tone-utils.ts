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

  const toneModule = renderToneModule(toneKey);

  // NOTE:
  // - これまでは overrides があると「置換」していたが、
  //   route.ts 側の systemOverride は「追加指示」扱いの想定があるため、
  //   ここではベース prompt に「追記」する。
  // - これにより tone-utils の仕様（ベース）と forcedSystem（追加）を同居できる。
  const extra = (overrides ?? "").toString().trim();

  const modules = [
    toneModule,
    "あなたはEC特化の日本語コピーライターAIです。敬体（です・ます）で、落ち着いた知性を保ち、読み手を尊重します。感情的な煽りや誇大広告は避け、事実ベースで具体的に伝えます。読み手に急いで行動を迫る、押し売り調の見出し（例:「さあ、今すぐ〜」など）は避け、穏やかに案内してください。",

    // ★本筋：薄入力でも品質を上げるための最小コア（情景1カット + 感覚語1つ）
    "【品質コア】本文冒頭〜ヘッド（最初の2文）で、必ず『情景1カット（時間/場所/動作のいずれか）』を1つ入れてください。さらに『感覚語（香り/音/口当たり/温度/手触り/のどごし等）』を1つだけ自然に入れてください。感覚語は盛りすぎず、1語で十分です。",

    // ★捏造防止：数値強制をやめ、入力にない仕様/数値は作らない
    "【捏造禁止】ユーザー入力や商品情報に無い『数値・仕様・比較結果・No.1表現・効能』は作らないでください。数値や仕様が入力にある場合のみ、それを根拠として具体的に書いてください。入力が薄い場合は、数値を作らずに『作り方/飲み方/相性/シーン/味の方向性』など、嘘にならない具体で補ってください。",

    // ★構造は維持しつつ、今のUI（短め本文＋箇条書き）でも破綻しない書き方へ
    "媒体と目的に応じて、ヘッドライン→概要→特長やベネフィットの順で整理してください。見出しは最大でもH2までにします。箇条書きは3〜7項目を目安にします。",

    "不自然なキーワード羅列は禁止です。単語の詰め込みではなく、自然な言い換え・共起語を使ってください。タイトルは目安32字、説明文は80〜120字程度を参考にします（厳密でなくて構いません）。",

    // CTAはUI側がOFFのときがあるので、押し付けずに運用できるように留める
    "CTAが求められている場合は、購入や申し込みなど主目的に直結した行動を穏やかに案内してください。代替CTAは低負荷の行動（比較検討、保存、別フレーバー確認など）を提案します。『その行動をすると何が得られるか』『どんな不安が下がるか』まで短く補足してください。ただし過度な断定は避けます。",

    "医薬的効能の断定、根拠のないNo.1表現、過度な断言、感嘆符の多用は禁止です。保証・返品・相性に関する不安は、必要な場合のみ短く触れてください。",

    // 既存の厳格条件は維持（！なし、敬体統一、整文）
    "【厳格条件】感嘆符は使用しません。語尾・表記揺れ・冗長な繰り返しは整えてください。文体は 'です・ます' で統一します。",

    "ユーザーが指定した商品・サービス・店舗・ブランド名をそのまま用い、別の名前や別の商品に置き換えないでください。固有名詞を別の企業名や別ブランド名に差し替えたり、別の商品に飛び換えたりしないでください。たとえば「アイン薬局」と指定された場合は必ず「アイン薬局」という表記を用い、その企業やサービスを正しく主語にしてください。",
  ];

  if (extra.length > 0) {
    modules.push(`【追加指示】\n${extra}`);
  }

  return modules.join("\n\n");
}
// app/api/writer/prompt/compose-v2.ts
/**
 * C10-2-5: Prompt Compose Layer v2（Precision Plan 統合ポイント）
 *
 * 目的:
 * - persona / tone / fewshot / normalizedInput を統合して
 *   { system, user } プロンプトを構築する「Precision 用の新レイヤー」
 * - 既存 compose.ts を壊さず、並行して検証・段階移行できるようにする
 *
 * 注意:
 * - 現時点ではどこからも呼ばれていない安全なスタブ実装
 * - 後続ステップ(C10-3〜)で core.ts / pipeline.ts から段階的に利用していく
 */

import type { NormalizedInput } from "../pipeline";
import type { PersonaKey, PersonaProfile } from "./persona";
import type { ToneKey, ToneProfile } from "./tone";
import type { FewshotExample, FewshotKey } from "./fewshot";

/** compose-v2 層に渡される入力コンテキスト */
export type ComposePromptV2Context = {
  normalized: NormalizedInput;
  persona: PersonaProfile;
  tone: ToneProfile;
  fewshot: FewshotExample[];

  systemOverride?: string | null;
  composedSystem?: string | null;
  composedUser?: string | null;
};

/** compose-v2 層が返す結果 */
export type ComposePromptV2Result = {
  system: string;
  user: string;
  usedPersonaKey: PersonaKey;
  usedToneKey: ToneKey;
  usedFewshotKeys: FewshotKey[];
};

/**
 * composePromptV2
 *
 * - persona / tone / fewshot / normalizedInput を統合して
 *   { system, user } を構築する Precision 版の中心関数
 * - 現時点では「安全な初期ロジック」として最小限の構造だけ実装し、
 *   Phase1〜3 で徐々に強化していく
 */
export function composePromptV2(
  ctx: ComposePromptV2Context,
): ComposePromptV2Result {
  const {
    normalized,
    persona,
    tone,
    fewshot,
    systemOverride,
    composedSystem,
    composedUser,
  } = ctx;

  // ===== system 部分 =====
  // 1. すでに上位レイヤーで組み立て済みならそれを優先
  if (composedSystem && composedSystem.trim().length > 0) {
    return {
      system: composedSystem,
      user:
        composedUser ??
        buildDefaultUserPromptV2(normalized),
      usedPersonaKey: persona.key,
      usedToneKey: tone.key,
      usedFewshotKeys: fewshot.map((f) => f.key),
    };
  }

  // 2. systemOverride があれば、それをベースとして使用
  const systemBase = (systemOverride ?? "").toString().trim();

  const personaHint = persona.systemHint.trim();
  const toneHint =
    (tone.systemHint ??
      `文章のトーンは ${tone.styleTags.join(" / ")} を意識してください。`).trim();

  // fewshot は必要に応じて system 側に簡易表示（Phase2 で強化予定）
  const fewshotSection =
    fewshot.length > 0 ? buildFewshotSectionV2(fewshot) : "";

  const systemParts: string[] = [];

  if (systemBase.length > 0) {
    systemParts.push(systemBase);
  }

  // Persona による人格指示
  systemParts.push(personaHint);

  // Tone によるトーン指示
  if (toneHint.length > 0) {
    systemParts.push(`【トーン指示】${toneHint}`);
  }

  // Fewshot（あれば）
  if (fewshotSection.length > 0) {
    systemParts.push(fewshotSection);
  }

  // 出力言語と体裁に関する最終指示（日本語固定）
  systemParts.push(
    "出力は日本語で行い、読みやすく、過度に煽らずに購入意欲を高めることを意識してください。",
  );

  const system = systemParts.join("\n\n");

  // ===== user 部分 =====
  const user =
    composedUser && composedUser.toString().trim().length > 0
      ? composedUser
      : buildDefaultUserPromptV2(normalized);

  return {
    system,
    user,
    usedPersonaKey: persona.key,
    usedToneKey: tone.key,
    usedFewshotKeys: fewshot.map((f) => f.key),
  };
}

/**
 * buildDefaultUserPromptV2
 *
 * - normalizedInput から、モデルに渡す最低限の依頼文を構築する
 * - 現時点では makeUserMessage と同等レベルの情報量を目指すが、
 *   実際のルート切り替えは C10-3 以降で慎重に行う
 */
function buildDefaultUserPromptV2(
  n: NormalizedInput,
): string {
  const lines: string[] = [];

  lines.push("以下の情報に基づいて、EC向けのセールスコピーを作成してください。");

  lines.push(
    [
      `【商品名】${n.product_name}`,
      `【カテゴリ】${n.category}`,
      `【ゴール】${n.goal}`,
    ].join("\n"),
  );

  if (n.audience) {
    lines.push(`【想定読者】${n.audience}`);
  }

  if (n.platform) {
    lines.push(`【掲載媒体】${n.platform}`);
  }

  if (n.keywords.length > 0) {
    lines.push(`【キーワード】${n.keywords.join("／")}`);
  }

  if (n.selling_points.length > 0) {
    lines.push(
      `【訴求したいポイント】${n.selling_points.join("／")}`,
    );
  }

  if (n.objections.length > 0) {
    lines.push(
      `【想定される不安・疑問】${n.objections.join("／")}`,
    );
  }

  if (n.evidence.length > 0) {
    lines.push(
      `【裏付けとなる情報】${n.evidence.join("／")}`,
    );
  }

  if (n.constraints.length > 0) {
    lines.push(
      `【制約条件】${n.constraints.join("／")}`,
    );
  }

  lines.push(
    "上記を踏まえ、読者の不安をやわらげつつ、自然に行動（購入・申し込み）につながる文章を作成してください。",
  );

  return lines.join("\n\n");
}

/**
 * buildFewshotSectionV2
 *
 * - fewshot 例文を system の補足として付与するための簡易実装
 * - Phase2 で詳細設計を行う前の暫定版
 */
function buildFewshotSectionV2(
  examples: FewshotExample[],
): string {
  if (examples.length === 0) return "";

  const header =
    "【参考となる例文】以下は、望ましいトーンや構成の参考例です。必要に応じてニュアンスを参考にしてください。";

  const bodies = examples.map(
    (ex, idx) => `▼例文${idx + 1}\n${ex.content}`,
  );

  return [header, ...bodies].join("\n\n");
}

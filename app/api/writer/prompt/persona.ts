// app/api/writer/prompt/persona.ts
/**
 * C10-2-3: Persona Layer（Precision Plan 用の語り手レイヤー）
 *
 * 目的:
 * - 「誰が話しているか」を定義する人格レイヤーを公式に用意する
 * - Phase1 で tone / persona を一緒に人格化するための基盤
 *
 * 注意:
 * - 現段階ではどこからも呼ばれていない安全なスタブ実装
 * - 後続で core.ts / tone.ts / fewshot.ts / compose.ts から利用していく
 */

import type { NormalizedInput } from "../pipeline";

/** Persona を識別するキー */
export type PersonaKey = string;

/** 語り手ペルソナのプロファイル */
export type PersonaProfile = {
  /** 一意キー（ログや設定で利用） */
  key: PersonaKey;
  /** UI 等で使うラベル */
  label: string;
  /** ペルソナの説明（内部メモ用・管理画面用） */
  description: string;
  /**
   * system プロンプト向けの人格ヒント文
   * - 「どのような人物として話すか」を指定
   */
  systemHint: string;
  /** タグ（tone や fewshot と紐づけやすくするための属性） */
  tags: string[];
};

/** Persona 解決時の入力コンテキスト */
export type ResolvePersonaContext = {
  /** normalizeInput 済み入力 */
  normalized: NormalizedInput;
  /** ユーザーが明示指定した persona（あれば） */
  requestedPersonaKey?: string | null;
};

/** Persona 解決結果 */
export type ResolvePersonaResult = {
  personaKey: PersonaKey;
  profile: PersonaProfile;
};

/** デフォルトのペルソナキー（現行仕様の暗黙デフォルトを命名） */
export const DEFAULT_PERSONA_KEY: PersonaKey = "ja_ec_copywriter";

/**
 * 初期 Persona 定義
 *
 * - 今後、UI や設定から編集可能にする前提の「組み込みプリセット」
 * - Phase1〜3 で増やしていく
 */
const PERSONA_PROFILES: Record<PersonaKey, PersonaProfile> = {
  ja_ec_copywriter: {
    key: "ja_ec_copywriter",
    label: "日本人ECコピーライター",
    description:
      "日本語ECに特化したプロのコピーライター。読みやすく、購入につながる文章を作ることを重視します。",
    systemHint:
      "あなたは日本のEC市場に詳しいプロのコピーライターです。読者に寄り添いながら、過度に煽らず、購入を前向きに検討したくなる文章を書いてください。",
    tags: ["ec", "copywriter", "default"],
  },
  ja_ec_consultant: {
    key: "ja_ec_consultant",
    label: "ECコンサルタント目線",
    description:
      "売上改善を支援するECコンサルタントとして、論理的かつ説得力のある説明を行います。",
    systemHint:
      "あなたは日本のEC事業者を支援するコンサルタントです。専門用語はかみくだき、ビジネス的なメリットが伝わるように説明してください。",
    tags: ["ec", "consultant", "expert"],
  },
  ja_friendly_mama: {
    key: "ja_friendly_mama",
    label: "子育てママ目線のやさしい語り",
    description:
      "子育て中のママ友に話しかけるような、親しみやすく安心感のあるトーンで説明します。",
    systemHint:
      "あなたは子育て中のママで、親しい友人に商品をおすすめするように話してください。専門用語を避け、不安をやわらげる表現を心がけてください。",
    tags: ["mama", "friendly", "casual"],
  },
};

/** 未定義ペルソナ用のフォールバック PersonaProfile を生成 */
function createFallbackPersonaProfile(key: PersonaKey): PersonaProfile {
  return {
    key,
    label: `カスタムペルソナ(${key})`,
    description:
      "事前定義されていないペルソナキー。プロンプト側で追加ルールを与える前提のカスタムペルソナです。",
    systemHint:
      "指定されたキャラクターや役割にふさわしい一貫した口調で話してください。",
    tags: ["custom"],
  };
}

/**
 * resolvePersona
 *
 * - Phase1 以降で人格化された「語り手」を決定する中心関数
 * - 現時点では requestedPersonaKey / normalized.brand_voice / デフォルト の順で決定する安全実装
 * - 後続ステップで tone / fewshot / style との連携を追加していく
 */
export function resolvePersona(
  ctx: ResolvePersonaContext,
): ResolvePersonaResult {
  const { normalized, requestedPersonaKey } = ctx;

  // 1. ユーザー指定（リクエスト側）が最優先
  let key: PersonaKey | null =
    (requestedPersonaKey ?? "").toString().trim() || null;

  // 2. brand_voice をヒントとして利用（将来は mapping で高度化予定）
  if (!key && normalized.brand_voice) {
    const hint = normalized.brand_voice.toString().trim();
    // TODO: brand_voice と PersonaKey のマッピングロジックは Phase1 以降で拡張
    if (hint.length > 0) {
      key = hint as PersonaKey;
    }
  }

  // 3. それでも決まらなければデフォルトペルソナ
  const effectiveKey: PersonaKey = key || DEFAULT_PERSONA_KEY;

  const profile =
    PERSONA_PROFILES[effectiveKey] ??
    createFallbackPersonaProfile(effectiveKey);

  return {
    personaKey: profile.key,
    profile,
  };
}

/**
 * getPersonaProfile
 *
 * - 既知の PersonaProfile を直接参照したい場合に利用
 * - 無ければフォールバックを返す
 */
export function getPersonaProfile(key: PersonaKey): PersonaProfile {
  return PERSONA_PROFILES[key] ?? createFallbackPersonaProfile(key);
}

/**
 * listPersonaProfiles
 *
 * - UI や管理画面から「選択可能なペルソナ一覧」を取得する用途を想定
 */
export function listPersonaProfiles(): PersonaProfile[] {
  return Object.values(PERSONA_PROFILES);
}

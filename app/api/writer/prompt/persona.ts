// app/api/writer/prompt/persona.ts
/**
 * P1-3: Persona Layer（Precision Plan 用の語り手レイヤー）
 *
 * 目的:
 * - 「誰が話しているか」を定義する人格レイヤーを公式に用意する
 * - Phase1 で tone / persona を一緒に人格化するための基盤
 * - UI 表示名（日本語）と内部キー（英語）を分離し、安全に扱えるようにする
 *
 * 注意:
 * - 現段階では core / pipeline などからの利用は限定的 or まだ未接続の安全レイヤー
 * - /api/writer の返却 shape には影響させない（Precision Plan 準拠）
 */

import type { NormalizedInput } from "../pipeline";

/**
 * Phase1 時点での「公式ペルソナキー」
 *
 * - ja_ec_copywriter  : 日本人ECコピーライター（デフォルト）
 * - ja_ec_consultant  : ECコンサルタント目線
 * - ja_friendly_mama  : 子育てママ目線のやさしい語り
 */
export const CANONICAL_PERSONA_KEYS = [
  "ja_ec_copywriter",
  "ja_ec_consultant",
  "ja_friendly_mama",
] as const;

export type CanonicalPersonaKey = (typeof CANONICAL_PERSONA_KEYS)[number];

/**
 * Persona を識別するキー
 *
 * - 公式ペルソナ: CanonicalPersonaKey
 * - カスタムペルソナ: 任意の string（将来、管理画面などから追加されることを想定）
 */
export type PersonaKey = CanonicalPersonaKey | (string & {});

/** 語り手ペルソナのプロファイル */
export type PersonaProfile = {
  /** 一意キー（英語の内部キー。ログや設定で利用） */
  key: PersonaKey;
  /**
   * UI 等で使う日本語ラベル
   * 例: "日本人ECコピーライター"
   */
  labelJa: string;
  /**
   * 日本語ラベルのサブコピー（ペルソナの一言説明）
   * 例: "日本語ECに特化したプロのコピーライター"
   */
  taglineJa: string;
  /** ペルソナの説明（内部メモ用・管理画面用の詳細文） */
  description: string;
  /**
   * system プロンプト向けの人格ヒント文
   * - 「どのような人物として話すか」を指定
   */
  systemHint: string;
  /** タグ（tone や fewshot と紐づけやすくするための属性） */
  tags: string[];
  /** 公式ペルソナかどうか（CANONICAL_PERSONA_KEYS に含まれる場合 true） */
  isCanonical: boolean;
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
export const DEFAULT_PERSONA_KEY: CanonicalPersonaKey = "ja_ec_copywriter";

/**
 * 初期 Persona 定義
 *
 * - 今後、UI や設定から編集可能にする前提の「組み込みプリセット」
 * - Phase1〜3 で増やしていく
 */
const PERSONA_PROFILES: Record<CanonicalPersonaKey, PersonaProfile> = {
  ja_ec_copywriter: {
    key: "ja_ec_copywriter",
    labelJa: "日本人ECコピーライター",
    taglineJa: "日本語ECに特化したプロ視点",
    description:
      "日本語ECに特化したプロのコピーライターとして、読みやすく、購入につながる文章を作ることを重視するペルソナです。日本のECモールや自社ECの文脈を前提とします。",
    systemHint:
      "あなたは日本のEC市場に詳しいプロのコピーライターです。読者に寄り添いながら、過度に煽らず、購入を前向きに検討したくなる文章を書いてください。",
    tags: ["ec", "copywriter", "default"],
    isCanonical: true,
  },
  ja_ec_consultant: {
    key: "ja_ec_consultant",
    labelJa: "ECコンサルタント目線",
    taglineJa: "論理と改善提案が得意",
    description:
      "売上改善を支援するECコンサルタントとして、論理的かつ説得力のある説明を行うペルソナです。施策やメリットを整理し、ビジネス観点から文章を組み立てます。",
    systemHint:
      "あなたは日本のEC事業者を支援するコンサルタントです。専門用語はかみくだき、ビジネス的なメリットや改善ポイントが伝わるように説明してください。",
    tags: ["ec", "consultant", "expert"],
    isCanonical: true,
  },
  ja_friendly_mama: {
    key: "ja_friendly_mama",
    labelJa: "子育てママ目線のやさしい語り",
    taglineJa: "ママ友に話すような安心感",
    description:
      "子育て中のママ友に話しかけるような、親しみやすく安心感のあるトーンで説明するペルソナです。共感とやさしさを大切にしながら商品をおすすめします。",
    systemHint:
      "あなたは子育て中のママで、親しい友人に商品をおすすめするように話してください。専門用語を避け、不安をやわらげる表現を心がけてください。",
    tags: ["mama", "friendly", "casual"],
    isCanonical: true,
  },
};

/** 未定義ペルソナ用のフォールバック PersonaProfile を生成 */
function createFallbackPersonaProfile(key: PersonaKey): PersonaProfile {
  return {
    key,
    labelJa: `カスタムペルソナ（${key}）`,
    taglineJa: "事前定義されていないカスタムペルソナ",
    description:
      "事前定義されていないペルソナキーです。プロンプト側で追加ルールを与える前提のカスタムペルソナとして扱われます。",
    systemHint:
      "指定されたキャラクターや役割にふさわしい一貫した口調で話してください。",
    tags: ["custom"],
    isCanonical: false,
  };
}

/**
 * resolvePersona
 *
 * - Phase1 以降で人格化された「語り手」を決定する中心関数
 * - 現時点では requestedPersonaKey / normalized.brand_voice / デフォルト の順で決定する安全実装
 * - 後続ステップで tone / fewshot / style との連携を追加していく
 *
 * ※ /api/writer のレスポンス shape には影響しないよう、戻り値は内部利用専用の構造を維持
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
  const effectiveKey: PersonaKey = (key as PersonaKey) || DEFAULT_PERSONA_KEY;

  const canonicalProfile =
    (PERSONA_PROFILES as Record<string, PersonaProfile>)[effectiveKey];
  const profile =
    canonicalProfile ?? createFallbackPersonaProfile(effectiveKey);

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
  const canonicalProfile =
    (PERSONA_PROFILES as Record<string, PersonaProfile>)[key];
  return canonicalProfile ?? createFallbackPersonaProfile(key);
}

/**
 * listPersonaProfiles
 *
 * - UI や管理画面から「選択可能なペルソナ一覧」を取得する用途を想定
 * - Phase1 では「公式ペルソナ 3 種」のみを返す
 */
export function listPersonaProfiles(): PersonaProfile[] {
  return CANONICAL_PERSONA_KEYS.map((key) => PERSONA_PROFILES[key]);
}

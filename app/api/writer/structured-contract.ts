// app/api/writer/structured-contract.ts
// ShopWriter intermediate contract の型定義
// - 本文 surface を保持しない
// - role / goal allocation / factIdsUsed / prohibitedMoves を型で固定する

export const RELATION_TYPES = [
  "SCENE_TO_LANDING",
  "VALUE_TO_LANDING",
  "NEED_TO_LANDING",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const LANDING_TYPES = ["SCENE", "SENSORY", "RESULT"] as const;
export type LandingType = (typeof LANDING_TYPES)[number];

export const HEAD1_ROLES = [
  "PRODUCT_SCENE_ENTRY",
  "PRODUCT_NEED_ENTRY",
  "PRODUCT_VALUE_ENTRY",
] as const;
export type Head1Role = (typeof HEAD1_ROLES)[number];

export const HEAD2_ROLES = [
  "SCENE_CONTINUATION",
  "NEED_ENTRY",
  "VALUE_ENTRY",
] as const;
export type Head2Role = (typeof HEAD2_ROLES)[number];

export const BODY1_ROLES = ["CORE_FACT", "PRIMARY_USEFUL_FACT"] as const;
export type Body1Role = (typeof BODY1_ROLES)[number];

export const BODY2_ROLES = [
  "ONE_STEP_HANDLING",
  "SPEC_IN_ACTION",
  "USE_SEQUENCE",
] as const;
export type Body2Role = (typeof BODY2_ROLES)[number];

export const BODY3_ROLES = [
  "IMMEDIATE_DELTA",
  "SMALL_RESULT",
  "OBSERVABLE_CHANGE",
] as const;
export type Body3Role = (typeof BODY3_ROLES)[number];

export const AUDIENCE_USAGE_MODES = ["HEAD_EXACT_ONCE"] as const;
export type AudienceUsageMode = (typeof AUDIENCE_USAGE_MODES)[number];

export type GoalAllocation = {
  head1: "PRODUCT_ENTRY";
  head2: "SCENE" | "NEED" | "VALUE";
  body1: "FACT" | "PRIMARY_VALUE";
  body2: "ACTION" | "SPEC_IN_USE" | "HANDLING";
  body3: "OBSERVABLE_DELTA" | "SMALL_RESULT";
};

export const ENDING_VARIATION_HINTS = [
  "AVOID_SAME_ENDING",
  "ALLOW_LIGHT_VARIATION",
] as const;
export type EndingVariationHint = (typeof ENDING_VARIATION_HINTS)[number];

export type StructuredWriterContract = {
  relation_type: RelationType;
  landing_type: LandingType;
  head1_role: Head1Role;
  head2_role: Head2Role;
  body1_role: Body1Role;
  body2_role: Body2Role;
  body3_role: Body3Role;
  audience_usage_mode: AudienceUsageMode;
  goal_allocation: GoalAllocation;
  ending_variation_hint: EndingVariationHint;
  fact_ids_used: string[];
  prohibited_moves: string[];
};

export const SURFACE_FORBIDDEN_KEYS = [
  "head_text",
  "body_text",
  "headline",
  "copy",
  "surface",
  "draft",
  "output",
] as const;

export function isSurfaceFreeStructuredContract(value: unknown): value is StructuredWriterContract {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  for (const key of SURFACE_FORBIDDEN_KEYS) {
    if (key in record) return false;
  }
  return true;
}

export function buildStructuredWriterContractSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      relation_type: { type: "string", enum: [...RELATION_TYPES] },
      landing_type: { type: "string", enum: [...LANDING_TYPES] },
      head1_role: { type: "string", enum: [...HEAD1_ROLES] },
      head2_role: { type: "string", enum: [...HEAD2_ROLES] },
      body1_role: { type: "string", enum: [...BODY1_ROLES] },
      body2_role: { type: "string", enum: [...BODY2_ROLES] },
      body3_role: { type: "string", enum: [...BODY3_ROLES] },
      audience_usage_mode: { type: "string", enum: [...AUDIENCE_USAGE_MODES] },
      goal_allocation: {
        type: "object",
        additionalProperties: false,
        properties: {
          head1: { type: "string", enum: ["PRODUCT_ENTRY"] },
          head2: { type: "string", enum: ["SCENE", "NEED", "VALUE"] },
          body1: { type: "string", enum: ["FACT", "PRIMARY_VALUE"] },
          body2: { type: "string", enum: ["ACTION", "SPEC_IN_USE", "HANDLING"] },
          body3: { type: "string", enum: ["OBSERVABLE_DELTA", "SMALL_RESULT"] },
        },
        required: ["head1", "head2", "body1", "body2", "body3"],
      },
      ending_variation_hint: { type: "string", enum: [...ENDING_VARIATION_HINTS] },
      fact_ids_used: { type: "array", items: { type: "string" }, minItems: 1 },
      prohibited_moves: { type: "array", items: { type: "string" } },
    },
    required: [
      "relation_type",
      "landing_type",
      "head1_role",
      "head2_role",
      "body1_role",
      "body2_role",
      "body3_role",
      "audience_usage_mode",
      "goal_allocation",
      "ending_variation_hint",
      "fact_ids_used",
      "prohibited_moves",
    ],
  };
}

import { describe, expect, it } from "vitest";
import {
  buildStructuredWriterContractSchema,
  isSurfaceFreeStructuredContract,
  type StructuredWriterContract,
} from "../structured-contract";

describe("structured-contract", () => {
  it("role / goal allocation を含む schema を持つ", () => {
    const schema = buildStructuredWriterContractSchema();
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    expect(properties.head1_role).toBeTruthy();
    expect(properties.head2_role).toBeTruthy();
    expect(properties.body1_role).toBeTruthy();
    expect(properties.body2_role).toBeTruthy();
    expect(properties.body3_role).toBeTruthy();
    expect(properties.goal_allocation).toBeTruthy();
    expect(properties.ending_variation_hint).toBeTruthy();
  });

  it("surface を持つ contract を拒否する", () => {
    const candidate = {
      relation_type: "VALUE_TO_LANDING",
      landing_type: "RESULT",
      head1_role: "PRODUCT_VALUE_ENTRY",
      head2_role: "VALUE_ENTRY",
      body1_role: "CORE_FACT",
      body2_role: "SPEC_IN_ACTION",
      body3_role: "SMALL_RESULT",
      audience_usage_mode: "HEAD_EXACT_ONCE",
      goal_allocation: {
        head1: "PRODUCT_ENTRY",
        head2: "VALUE",
        body1: "FACT",
        body2: "SPEC_IN_USE",
        body3: "SMALL_RESULT",
      },
      ending_variation_hint: "AVOID_SAME_ENDING",
      fact_ids_used: ["fact_1"],
      prohibited_moves: ["NO_FIXED_HEAD_SURFACE"],
      head_text: "これは禁止",
    };

    expect(isSurfaceFreeStructuredContract(candidate)).toBe(false);
  });

  it("surface を持たない contract を許可する", () => {
    const candidate: StructuredWriterContract = {
      relation_type: "SCENE_TO_LANDING",
      landing_type: "SCENE",
      head1_role: "PRODUCT_SCENE_ENTRY",
      head2_role: "SCENE_CONTINUATION",
      body1_role: "CORE_FACT",
      body2_role: "ONE_STEP_HANDLING",
      body3_role: "IMMEDIATE_DELTA",
      audience_usage_mode: "HEAD_EXACT_ONCE",
      goal_allocation: {
        head1: "PRODUCT_ENTRY",
        head2: "SCENE",
        body1: "FACT",
        body2: "ACTION",
        body3: "OBSERVABLE_DELTA",
      },
      ending_variation_hint: "AVOID_SAME_ENDING",
      fact_ids_used: ["fact_1", "fact_2"],
      prohibited_moves: ["NO_ABSTRACT_PROMOTION_SUMMARY"],
    };

    expect(isSurfaceFreeStructuredContract(candidate)).toBe(true);
  });
});

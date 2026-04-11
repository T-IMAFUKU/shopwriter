import { describe, expect, it } from "vitest";
import {
  evaluateFinalProseBoundary,
  type NormalizedInput,
} from "../pipeline";

function makeStorageInput(): NormalizedInput {
  return {
    product_name: "フタ付き積み重ね収納ボックス Mサイズ",
    category: "",
    goal: "洗面所やクローゼットで、小物を見失わずにすっきり整理したい",
    audience: "限られた収納スペースを整えたい一人暮らしや共働き世帯",
    platform: "lp",
    keywords: [],
    constraints: [],
    brand_voice: null,
    tone: "warm",
    style: "lp",
    length_hint: null,
    selling_points: [
      "フタ付きで中身を隠しやすい",
      "積み重ねやすい形",
      "小物をまとめやすい",
    ],
    objections: [],
    evidence: [],
    cta_preference: [],
    _raw: "",
  };
}

describe("final-prose-boundary", () => {
  it("head の abstract promotion を落とす", () => {
    const input = makeStorageInput();
    const text = [
      "フタ付き積み重ね収納ボックス Mサイズは、限られた収納スペースを整えたい一人暮らしや共働き世帯に向けた便利な収納です。",
      "洗面所やクローゼットでも取り入れやすく、毎日の片づけに役立つアイテムです。",
      "",
      "- 中身を隠しながらまとめやすいです。",
      "- 積み重ねやすく、置き場所を整えやすいです。",
      "- 小物をひとまとめにしやすいです。",
    ].join("\n");

    const result = evaluateFinalProseBoundary(text, input);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("HEAD_ABSTRACT_PROMOTION");
  });

  it("purpose misalignment を落とす", () => {
    const input = makeStorageInput();
    const text = [
      "フタ付き積み重ね収納ボックス Mサイズは、限られた収納スペースを整えたい一人暮らしや共働き世帯に向けた収納です。",
      "玄関まわりで来客前に見た目を整えたい場面でも、まとめて置きやすい使い方ができます。",
      "",
      "- 中身を隠しながらまとめやすいです。",
      "- 取り出しやすい位置に置いて使えます。",
      "- 玄関の小物を整えたいときに役立ちます。",
    ].join("\n");

    const result = evaluateFinalProseBoundary(text, input);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("PURPOSE_NOT_ALIGNED");
  });

  it("head の source restatement を落とす", () => {
    const input = makeStorageInput();
    const text = [
      "フタ付き積み重ね収納ボックス Mサイズは、限られた収納スペースを整えたい一人暮らしや共働き世帯に向いた収納です。",
      "洗面所やクローゼットで、小物を見失わずにすっきり整理したい場面に、そのまま取り入れやすいです。",
      "",
      "- 中身を隠しながらまとめやすいです。",
      "- 取り出しやすい位置に置いて、そのまま重ねて使えます。",
      "- 小物をひとまとまりにできるので、探す手間が少し減ります。",
    ].join("\n");

    const result = evaluateFinalProseBoundary(text, input);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("HEAD_SOURCE_RESTATEMENT");
  });

  it("body の source restatement を落とす", () => {
    const input = makeStorageInput();
    const text = [
      "フタ付き積み重ね収納ボックス Mサイズは、限られた収納スペースを整えたい一人暮らしや共働き世帯の片づけ導線に置きやすい収納です。",
      "洗面台の横やクローゼットの棚でも、手を止めずに小物を寄せて入れやすくなります。",
      "",
      "- フタで中身を隠しやすく、見た目をまとめやすいです。",
      "- 積み重ねやすい形をそのまま生かして、縦に重ねて置きやすいです。",
      "- 洗面所やクローゼットで、小物を見失わずにすっきり整理したいときに使いやすいです。",
    ].join("\n");

    const result = evaluateFinalProseBoundary(text, input);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("BODY_SOURCE_RESTATEMENT");
  });

  it("audience が body に漏れたら落とす", () => {
    const input = makeStorageInput();
    const text = [
      "フタ付き積み重ね収納ボックス Mサイズは、限られた収納スペースを整えたい一人暮らしや共働き世帯が洗面台の横に置きやすい収納です。",
      "クローゼットの棚でも、手を止めずに小物を寄せてしまいやすくなります。",
      "",
      "- フタで中身を隠しやすく、見た目をまとめやすいです。",
      "- 棚の上で重ねて置きやすく、出し入れの流れを切りにくいです。",
      "- 限られた収納スペースを整えたい一人暮らしや共働き世帯でも、小物の置き場所を追いやすくなります。",
    ].join("\n");

    const result = evaluateFinalProseBoundary(text, input);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("AUDIENCE_NOT_EXACT_ONCE_IN_HEAD");
  });
});

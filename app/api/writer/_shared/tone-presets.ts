// app/api/writer/_shared/tone-presets.ts
// H-5/H-7 で拡張していく「しゃべり方」プリセット（最小版）

export type ToneName = "warm_intelligent" | "formal" | "emotional_sincere";

// プロンプトに埋め込む指示の雛形（まずは既存の実態に近い内容で）
export const tonePresets: Record<ToneName, { system: string; notes?: string[] }> = {
  warm_intelligent: {
    system:
      "丁寧で温度感のある知的な語り。断定しすぎず、読者の理解を助ける補足を短く添える。",
    notes: ["専門用語は補足", "過度な煽り禁止", "です・ます"],
  },
  formal: {
    system:
      "簡潔・中立・事実ベース。社外文書として通る丁寧さで、箇条書きや小見出しを活用。",
  },
  emotional_sincere: {
    system:
      "感情に寄り添い、誠実で温かい語り。体験・共感を起点に、最後は静かに背中を押す。",
  },
};

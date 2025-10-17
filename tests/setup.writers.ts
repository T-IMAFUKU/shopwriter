// tests/setup.writers.ts
import { vi } from "vitest";

// 認証はテスト固定（ネットワーク不要）
vi.mock("next-auth", () => ({
  getServerSession: async () => ({
    user: { id: "test-user-123", name: "Test User" },
    expires: "2099-01-01T00:00:00.000Z",
  }),
}));

// OpenAI を常にモック（responses と chat.completions 両系統）
vi.mock("openai", () => {
  const TEXT = "MOCK_OUTPUT #test"; // ← ハッシュタグを1つ入れておく
  class OpenAI {
    responses = { create: async () => ({ output: TEXT }) };
    chat = {
      completions: {
        create: async () => ({
          choices: [{ message: { content: TEXT } }],
        }),
      },
    };
  }
  return { default: OpenAI, OpenAI };
});

// tests/setup.writers.ts
import { vi } from "vitest";

// ✅ NextAuth(v4) handler 生成（default export）をモック
vi.mock("next-auth", () => {
  const NextAuth = (_options: unknown) => {
    return async () => new Response("OK", { status: 200 });
  };

  return {
    __esModule: true,
    default: NextAuth,
  };
});

// ✅ /api/writer が使う getServerSession は "next-auth/next" から来るので、ここも必ずモックする
vi.mock("next-auth/next", () => ({
  getServerSession: async () => ({
    user: {
      id: "test-user-123",
      name: "Test User",
      // email は無くても route.ts 側で「USER_NOT_FOUND→無料扱い」になる想定
      // email: "test@example.com",
    },
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

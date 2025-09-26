// tests/api/shares.route.test.ts
// 目的：/api/shares の GET/POST を Prisma モックで統合テスト
// 修正点：process.env への代入禁止エラー対応（vi.stubEnv / vi.unstubAllEnvs を使用）

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---- Prisma モック（hoisted）----
const mockState = vi.hoisted(() => ({
  db: {
    share: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@prisma/client", () => {
  return {
    PrismaClient: function PrismaClient(this: any) {
      return mockState.db as any;
    },
  };
});

// Prisma モック確定後にハンドラを import
import { GET, POST } from "@/app/api/shares/route";

// ---- env & ヘルパ ----
// ※ 直接代入ではなく、Vitestの stub API を使う
const setDev = () => {
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ALLOW_DEV_HEADER", "1");
};
const setProd = () => {
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "production");
};

const jsonOf = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

type ShareRow = {
  id: string;
  title: string;
  body: string | null;
  isPublic: boolean;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

beforeEach(() => {
  setDev(); // 毎テスト前に dev 環境へ
  const now = new Date("2025-01-01T00:00:00.000Z");

  const rows: ShareRow[] = [
    {
      id: "cm_2",
      title: "契約テスト（日本語）",
      body: "こんにちは",
      isPublic: false,
      ownerId: "dev-user-1",
      createdAt: new Date(now.getTime() - 1000),
      updatedAt: new Date(now.getTime() - 1000),
    },
    {
      id: "cm_1",
      title: "英字Title",
      body: null,
      isPublic: true,
      ownerId: "dev-user-1",
      createdAt: new Date(now.getTime() - 2000),
      updatedAt: new Date(now.getTime() - 2000),
    },
  ];

  mockState.db.share.findMany.mockReset();
  mockState.db.share.create.mockReset();

  mockState.db.share.findMany.mockResolvedValue(rows);
  mockState.db.share.create.mockResolvedValue({
    id: "cm_new",
    title: "新規タイトル",
    body: "本文",
    isPublic: false,
    ownerId: "dev-user-1",
    createdAt: new Date(now.getTime() + 1000),
    updatedAt: new Date(now.getTime() + 1000),
  } satisfies ShareRow);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ---- テスト ----
describe("/api/shares GET", () => {
  it("開発環境：X-User-Id ありで 200 & List 返却", async () => {
    setDev();
    const url = "http://localhost/api/shares?limit=2";
    const req = {
      url,
      headers: new Headers({ "X-User-Id": "dev-user-1" }),
    } as any;

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await jsonOf(res);
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items.length).toBeGreaterThan(0);
    expect(json.items[0]).toHaveProperty("id");
    expect(json.items[0]).toHaveProperty("title");
    expect(json.items[0]).toHaveProperty("isPublic");
    expect(json).toHaveProperty("nextCursor");
  });

  it("不正クエリ(limitが大きすぎ)は 400", async () => {
    setDev();
    const url = "http://localhost/api/shares?limit=999";
    const req = {
      url,
      headers: new Headers({ "X-User-Id": "dev-user-1" }),
    } as any;
    const res = await GET(req);
    expect(res.status).toBe(400);
    const j = await jsonOf(res);
    expect(j.code).toBe("BAD_REQUEST");
  });

  it("本番環境：認証なしは 401", async () => {
    setProd();
    const url = "http://localhost/api/shares?limit=5";
    const req = {
      url,
      headers: new Headers(), // ユーザヘッダなし
    } as any;
    const res = await GET(req);
    expect(res.status).toBe(401);
    const j = await jsonOf(res);
    expect(j.code).toBe("UNAUTHORIZED");
  });
});

describe("/api/shares POST", () => {
  it("開発環境：X-User-Id ありで 201 & Entity 返却", async () => {
    setDev();
    const url = "http://localhost/api/shares";
    const req = {
      url,
      headers: new Headers({
        "content-type": "application/json; charset=utf-8",
        "X-User-Id": "dev-user-1",
      }),
      json: async () => ({ title: "新規タイトル", body: "本文", isPublic: false }),
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await jsonOf(res);
    expect(json).toHaveProperty("id");
    expect(json.title).toBe("新規タイトル");
    expect(json.isPublic).toBe(false);
  });

  it("不正ボディ（title 空）は 422", async () => {
    setDev();
    const url = "http://localhost/api/shares";
    const req = {
      url,
      headers: new Headers({
        "content-type": "application/json; charset=utf-8",
        "X-User-Id": "dev-user-1",
      }),
      json: async () => ({ title: "", isPublic: true }),
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(422);
    const j = await jsonOf(res);
    expect(j.code).toBe("UNPROCESSABLE_ENTITY");
  });

  it("本番環境：認証なしは 401", async () => {
    setProd();
    const url = "http://localhost/api/shares";
    const req = {
      url,
      headers: new Headers({ "content-type": "application/json; charset=utf-8" }),
      json: async () => ({ title: "prod", isPublic: false }),
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(401);
    const j = await jsonOf(res);
    expect(j.code).toBe("UNAUTHORIZED");
  });
});

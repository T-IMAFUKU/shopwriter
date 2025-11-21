/**
 * app/api/writer/parse.ts
 * Phase B - Step B-2-a: request parsing shim（未接続）
 *
 * - /api/writer route.ts から切り出す前段階の「安全シム」
 * - まだ route.ts からは呼ばれない（次ステップで接続する）
 * - いまは「JSON を受け取って、最低限の形にして返す」だけ
 *
 * 次ステップ以降で:
 * - normalizeInput をここに移動
 * - 実際の WriterInput 型に合わせてフィールドを精密化
 */

export type RawWriterBody = unknown;

/**
 * ParsedWriterRequest
 *
 * - 現時点では「ゆるい型」のままにしておく
 * - 後で app/api/writer/route.ts を見ながら、
 *   実際に使っているフィールドに合わせて厳密化する。
 */
export type ParsedWriterRequest = {
  category?: string | null;
  goal?: string | null;
  platform?: string | null;
  toneId?: string | null;
  // TODO: route.ts 側の実使用フィールドに合わせて拡張する
  [key: string]: unknown;
};

/**
 * parseWriterRequest
 *
 * - Request から JSON を取り出す
 * - 取り出した値を ParsedWriterRequest として扱える形にそろえる
 * - 失敗した場合は ok: false を返す（例外は外に出さない）
 *
 * ※ まだ normalizeInput は呼ばない。
 *   後続フェーズ（B-2-b 以降）でここに統合する。
 */
export async function parseWriterRequest(
  req: Request,
): Promise<
  | { ok: true; data: ParsedWriterRequest }
  | { ok: false; error: Error }
> {
  try {
    const body = (await req.json()) as RawWriterBody;

    const parsed: ParsedWriterRequest =
      body && typeof body === "object"
        ? (body as ParsedWriterRequest)
        : {};

    return {
      ok: true,
      data: parsed,
    };
  } catch (err) {
    const error =
      err instanceof Error
        ? err
        : new Error("Failed to parse /api/writer request body");

    return {
      ok: false,
      error,
    };
  }
}

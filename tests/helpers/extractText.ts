// tests/helpers/extractText.ts
type AnyRec = Record<string, any>;

function joinBlocks(arr: any[]): string | undefined {
  const pick = (o: AnyRec) =>
    o?.text ?? o?.content ?? o?.body ?? o?.markdown ?? o?.plain;
  const parts = arr.map(pick).filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

/**
 * /api/writer の多形レスポンスから “本文テキスト” を頑健に抽出する
 */
export function extractText(json: AnyRec): string | undefined {
  // 直指定フィールド群
  const direct =
    json?.output ??
    json?.data?.text ??
    json?.text ??
    json?.result ??
    json?.content ??
    json?.data?.output;
  if (typeof direct === "string" && direct.trim()) return direct;

  // sections 配列
  const sections = json?.data?.sections ?? json?.sections;
  if (Array.isArray(sections)) {
    const s = joinBlocks(sections);
    if (s) return s;
  }

  // blocks/items 配列
  const blocks =
    json?.data?.blocks ?? json?.blocks ?? json?.data?.items ?? json?.items;
  if (Array.isArray(blocks)) {
    const s = joinBlocks(blocks);
    if (s) return s;
  }

  // data 自体が配列
  if (Array.isArray(json?.data)) {
    const s = joinBlocks(json.data);
    if (s) return s;
  }

  return undefined;
}

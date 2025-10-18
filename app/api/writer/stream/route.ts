// app/api/writer/stream/route.ts
// Runtime: Node.js（外部API・環境変数利用のため）
export const runtime = "nodejs";

// /api/writer/stream は現行実装では /api/writer の POST を再利用
// 注意: ../route は POST のみをエクスポートしているため、GET は再エクスポートしない
export { POST } from "../route";

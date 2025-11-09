/** app/api/writer/validation.ts - Stage1: 素通し、後でZod化 */
export type WriterInput = Record<string, unknown>;
export function parseInput(raw: unknown): WriterInput {
  if (raw && typeof raw === "object") return raw as WriterInput;
  return {};
}
import type { GenerationItem } from "./types";
import { sanitizeMode } from "./comet-server";

type Row = Record<string, unknown>;

/** Maps a Generation DB row to the client-safe metadata item (no base64 payload). */
export function serializeGenerationRow(row: Row): GenerationItem {
  return {
    id: row.id as string,
    prompt: row.prompt as string,
    mode: sanitizeMode(row.mode),
    model: row.model as string,
    size: row.size as string,
    quality: row.quality as string,
    outputFormat: row.outputFormat as string,
    background: (row.background as string) ?? null,
    revisedPrompt: (row.revisedPrompt as string) ?? null,
    usedReference: Boolean(row.usedReference),
    mimeType: row.mimeType as string,
    inputTokens: (row.inputTokens as number) ?? null,
    outputTokens: (row.outputTokens as number) ?? null,
    totalTokens: (row.totalTokens as number) ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

/**
 * The AI model registry (spec 0001, spec 0003 AC-4).
 *
 * One place that maps a stable string key to a configured model instance,
 * so callers embed against `getEmbeddingModel()` and record the key they
 * used (`movies.embedding_model`) rather than hardcoding a provider model
 * id at every call site. A later model change is then a single edit here
 * plus a version bump that the weekly sweep re-embeds against.
 *
 * The OpenAI provider is built with the key from `src/env.ts` rather than
 * letting the SDK read `process.env.OPENAI_API_KEY` itself, so environment
 * access stays in the one module that parses and validates it.
 */
import { createOpenAI } from "@ai-sdk/openai";
import type { EmbeddingModel } from "ai";

import { env } from "@/env";

/** The registry key stored in `movies.embedding_model`. Bump the model here and in `EMBEDDING_TEXT_VERSION` together. */
export const EMBEDDING_MODEL_KEY = "text-embedding-3-small" as const;
export type EmbeddingModelKey = typeof EMBEDDING_MODEL_KEY;

let cachedProvider: ReturnType<typeof createOpenAI> | undefined;

function openaiProvider(): ReturnType<typeof createOpenAI> {
  if (!cachedProvider) {
    cachedProvider = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return cachedProvider;
}

/** The embedding model for a registry key. `text-embedding-3-small` is 1536-dimensional, matching `movies.embedding`. */
export function getEmbeddingModel(key: EmbeddingModelKey = EMBEDDING_MODEL_KEY): EmbeddingModel {
  switch (key) {
    case "text-embedding-3-small":
      return openaiProvider().embedding("text-embedding-3-small");
  }
}

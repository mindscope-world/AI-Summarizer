import {ChatGroq} from '@langchain/groq';
import type {BaseChatModel} from '@langchain/core/language_models/chat_models';
import type {Env} from '../lib/env';

/**
 * Chat models go through LangChain so the rest of the server depends on the
 * `BaseChatModel` interface, not on a vendor SDK. Swapping providers later means
 * changing this file only.
 *
 * Both models are open-weights (Qwen) served by Groq's hosted API. Temperature 0 keeps
 * transcription and extraction deterministic.
 */
export function createChatModel(env: Env, opts: {model?: string; temperature?: number; maxTokens?: number} = {}): BaseChatModel {
  return new ChatGroq({
    apiKey: env.GROQ_API_KEY,
    baseUrl: env.GROQ_BASE_URL,
    model: opts.model ?? env.LLM_MODEL,
    temperature: opts.temperature ?? 0,
    maxTokens: opts.maxTokens,
    // Only gpt-oss models take a reasoning setting; other models would reject it.
    reasoningEffort: (opts.model ?? env.LLM_MODEL).startsWith('openai/gpt-oss') ? env.LLM_REASONING_EFFORT : undefined,
    maxRetries: env.LLM_MAX_RETRIES,
    timeout: env.LLM_TIMEOUT_MS,
  });
}

/** What the API tells clients about the AI layer (never the key). */
export function describeAi(env: Env) {
  return {provider: 'groq' as const, model: env.LLM_MODEL, ocrModel: env.OCR_MODEL};
}

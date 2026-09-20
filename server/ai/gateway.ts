import type {BaseChatModel} from '@langchain/core/language_models/chat_models';
import type {BaseMessageLike} from '@langchain/core/messages';
import type {z} from 'zod';
import type {Env} from '../lib/env';
import {createChatModel} from './model';
import {describeLlmFailure, UnusableModelOutputError} from './errors';
import {RateBudget} from './rateBudget';

export interface CallOptions {
  /** Hard cap on generated tokens (includes hidden reasoning tokens on reasoning models). */
  maxTokens: number;
  /** What we expect to generate; used to reserve rate-limit budget. */
  expectedOutput: number;
  signal?: AbortSignal;
  /** What the call is for, used in error messages ("Translation failed: ..."). Defaults to "Summarization". */
  task?: string;
  /** Called when the call has to wait for the token budget. */
  onWait?: (ms: number) => void;
}

/** The one door to the language model: budgeting, LangChain, and error mapping live here. */
export interface LlmGateway {
  readonly modelName: string;
  text(messages: BaseMessageLike[], opts: CallOptions): Promise<string>;
  structured<T>(schema: z.ZodType<T>, name: string, messages: BaseMessageLike[], opts: CallOptions): Promise<T>;
}

/** Rough token estimate, deliberately on the high side (Swahili and code tokenise worse than English). */
const estimateTokens = (chars: number) => Math.ceil(chars / 3.5);

function messageChars(messages: BaseMessageLike[]): number {
  let n = 0;
  for (const m of messages) {
    const content = Array.isArray(m) ? m[1] : (m as {content?: unknown}).content;
    n += typeof content === 'string' ? content.length : JSON.stringify(content ?? '').length;
  }
  return n;
}

function textOf(content: unknown): string {
  const raw =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((p) => (typeof p === 'string' ? p : ((p as {text?: string}).text ?? ''))).join('')
        : '';
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

interface UsageHolder {
  usage_metadata?: {total_tokens?: number; output_tokens?: number};
}

export function createLlmGateway(env: Env, budget = new RateBudget({tokensPerMinute: env.LLM_TPM})): LlmGateway {
  const models = new Map<number, BaseChatModel>();
  const modelFor = (maxTokens: number) => {
    let m = models.get(maxTokens);
    if (!m) models.set(maxTokens, (m = createChatModel(env, {maxTokens})));
    return m;
  };
  // Only gpt-oss models support native JSON-schema output; the others use tool calling.
  const method = env.LLM_MODEL.startsWith('openai/gpt-oss') ? 'jsonSchema' : 'functionCalling';

  async function run<T>(messages: BaseMessageLike[], opts: CallOptions, task: string, call: (signal?: AbortSignal) => Promise<{value: T; usage?: UsageHolder['usage_metadata']}>) {
    const input = estimateTokens(messageChars(messages)) + 80;
    const reservation = await budget.reserve(input, opts.expectedOutput, {signal: opts.signal, onWait: opts.onWait});
    try {
      const {value, usage} = await call(opts.signal);
      if (usage?.total_tokens) reservation.settle({total: usage.total_tokens, output: usage.output_tokens ?? opts.expectedOutput});
      return value;
    } catch (err) {
      // A failed call may still have consumed quota, so keep the reservation; just map the error.
      if (opts.signal?.aborted) throw err;
      if (err instanceof UnusableModelOutputError) throw err;
      throw describeLlmFailure(err, task);
    }
  }

  return {
    modelName: env.LLM_MODEL,

    async text(messages, opts) {
      return run(messages, opts, opts.task ?? 'Summarization', async (signal) => {
        const response = await modelFor(opts.maxTokens).invoke(messages, {signal});
        return {value: textOf(response.content), usage: (response as UsageHolder).usage_metadata};
      });
    },

    async structured<T>(schema: z.ZodType<T>, name: string, messages: BaseMessageLike[], opts: CallOptions) {
      return run(messages, opts, opts.task ?? 'Summarization', async (signal) => {
        const runnable = modelFor(opts.maxTokens).withStructuredOutput(schema as never, {name, method, includeRaw: true}) as unknown as {
          invoke(m: BaseMessageLike[], o?: {signal?: AbortSignal}): Promise<{raw: UsageHolder; parsed: T | null; parsing_error?: unknown}>;
        };
        const out = await runnable.invoke(messages, {signal});
        if (out.parsed == null) throw new UnusableModelOutputError('The model did not return valid structured output.');
        return {value: out.parsed, usage: out.raw?.usage_metadata};
      });
    },
  };
}

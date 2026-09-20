import {z} from 'zod';

const PLACEHOLDER_KEYS = new Set(['MY_GROQ_API_KEY', 'YOUR_API_KEY', 'your-api-key', 'gsk_your_key_here']);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  GROQ_API_KEY: z
    .string({error: 'GROQ_API_KEY is required'})
    .trim()
    .min(1, 'GROQ_API_KEY is required')
    .refine((v) => !PLACEHOLDER_KEYS.has(v), 'GROQ_API_KEY is still the placeholder value'),
  /** Override to point LangChain at a proxy or a compatible server. Defaults to Groq's public API. */
  GROQ_BASE_URL: z.url().optional(),
  /**
   * Open-weights chat model used for summarization (via LangChain). Keep a gpt-oss model here: Groq caps
   * Qwen at 1,000 output tokens/min, which is less than one summarization call asks for.
   */
  LLM_MODEL: z.string().trim().min(1).default('openai/gpt-oss-120b'),
  /** Reasoning effort for gpt-oss models. "low" keeps latency and token use down. */
  LLM_REASONING_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  /** Tokens per minute (input + output) we allow ourselves on the text model. Groq's free tier is 8000. */
  LLM_TPM: z.coerce.number().int().min(500).default(7000),
  /** Output tokens per minute for the OCR model. Qwen on Groq's free tier is capped at 1000. */
  OCR_OUTPUT_TPM: z.coerce.number().int().min(100).default(900),
  /** How many summarizations may run at once (they share one small token budget). */
  LLM_MAX_CONCURRENT: z.coerce.number().int().min(1).max(20).default(2),
  /** Approximate size of each section when a long document is summarised in parts. */
  SUMMARY_CHUNK_TOKENS: z.coerce.number().int().min(500).max(20_000).default(3000),
  /** Longer documents are refused (extractive mode has no such limit). */
  SUMMARY_MAX_CHUNKS: z.coerce.number().int().min(1).max(100).default(10),
  SUMMARIZE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(6),
  /** Vision-capable open-weights model used to read scanned PDFs. */
  OCR_MODEL: z.string().trim().min(1).default('qwen/qwen3.8-27b'),
  OCR_MAX_PAGES: z.coerce.number().int().positive().max(200).default(20),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(60_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  APP_URL: z.url().optional(),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(200).default(50),
  JSON_BODY_LIMIT: z
    .string()
    .regex(/^\d+(kb|mb)$/i, 'JSON_BODY_LIMIT must look like "512kb" or "2mb"')
    .default('2mb'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  EXTRACT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  MAX_PDF_PAGES: z.coerce.number().int().positive().max(5000).default(500),
  MAX_EXTRACTED_CHARS: z.coerce.number().int().positive().default(3_000_000),
  URL_FETCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  URL_FETCH_MAX_MB: z.coerce.number().positive().max(100).default(10),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(
      `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
        'See .env.example for the expected variables.',
    );
    this.name = 'EnvError';
  }
}

/**
 * Validates configuration and fails fast. Problem messages never include the
 * offending value, so a bad secret is not echoed into logs.
 */
export function loadEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Env {
  // Treat `FOO=` (empty) the same as unset so defaults apply.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new EnvError(parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`));
  }
  return parsed.data;
}

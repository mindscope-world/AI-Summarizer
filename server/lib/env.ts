import {z} from 'zod';

const PLACEHOLDER_KEYS = new Set(['MY_GEMINI_API_KEY', 'YOUR_API_KEY', 'your-api-key']);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  GEMINI_API_KEY: z
    .string({error: 'GEMINI_API_KEY is required'})
    .trim()
    .min(1, 'GEMINI_API_KEY is required')
    .refine((v) => !PLACEHOLDER_KEYS.has(v), 'GEMINI_API_KEY is still the placeholder value'),
  APP_URL: z.url().optional(),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(200).default(50),
  JSON_BODY_LIMIT: z
    .string()
    .regex(/^\d+(kb|mb)$/i, 'JSON_BODY_LIMIT must look like "512kb" or "2mb"')
    .default('2mb'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
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

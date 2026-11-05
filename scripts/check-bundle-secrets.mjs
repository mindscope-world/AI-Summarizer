#!/usr/bin/env node
/**
 * Fails if the built client bundle (dist/) contains anything that looks like a
 * server-side secret. Run after `npm run build`:  npm run verify:bundle
 *
 * Checks for:
 *   1. the actual values of secret-looking variables from the environment and .env
 *      (VITE_* variables are public by design, e.g. the Supabase anon key, and are skipped)
 *   2. server-only setting names (would mean a Vite `define` leak)
 *   3. anything shaped like a Groq API key (gsk_...)
 */
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), process.argv[2] ?? 'dist');
const SECRET_NAME = /(KEY|SECRET|TOKEN|PASSWORD)/i;
const PLACEHOLDER = /^(MY_|YOUR_|your-|changeme|example)/i;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

function parseDotenv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

if (!existsSync(distDir)) {
  console.error(`verify:bundle: ${distDir} does not exist. Run \`npm run build\` first.`);
  process.exit(2);
}

const candidates = {...parseDotenv(path.resolve(process.cwd(), '.env')), ...process.env};
const secretValues = Object.entries(candidates)
  .filter(([name, value]) => !name.startsWith('VITE_') && SECRET_NAME.test(name) && value && value.length >= 8 && !PLACEHOLDER.test(value))
  .map(([name, value]) => ({name, value}));

const forbiddenLiterals = ['GROQ_API_KEY', 'process.env.GROQ', 'GROQ_BASE_URL', 'SUPABASE_JWT_SECRET', 'SUPABASE_SERVICE_ROLE'];
const groqKey = /gsk_[A-Za-z0-9]{20,}/;

const findings = [];
let scanned = 0;
for (const file of walk(distDir)) {
  if (!/\.(js|mjs|css|html|map|json|txt)$/.test(file)) continue;
  scanned++;
  const content = readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file);
  for (const {name, value} of secretValues) {
    if (content.includes(value)) findings.push(`${rel}: contains the value of ${name}`);
  }
  for (const lit of forbiddenLiterals) {
    if (content.includes(lit)) findings.push(`${rel}: contains "${lit}"`);
  }
  if (groqKey.test(content)) findings.push(`${rel}: contains a Groq API key pattern`);
}

if (findings.length) {
  console.error('verify:bundle FAILED: possible secret exposure in the client bundle:');
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verify:bundle OK: scanned ${scanned} files in ${path.relative(process.cwd(), distDir) || '.'}; ` +
  `checked ${secretValues.length} secret value(s) plus name/pattern rules.`);

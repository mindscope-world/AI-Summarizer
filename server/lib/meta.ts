import {readFileSync} from 'node:fs';
import path from 'node:path';

export const SERVICE_NAME = 'leaderforge-academic-summarizer';

/** Reads the version from package.json (run from the project root: dev, build and start all do). */
export function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {version?: string};
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

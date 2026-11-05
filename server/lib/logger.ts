export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

const ORDER: Record<LogLevel, number> = {debug: 10, info: 20, warn: 30, error: 40};

/**
 * Minimal JSON-lines logger. Callers must only pass metadata (ids, status,
 * timings): never document text, request bodies, tokens or API keys.
 */
export function createLogger(level: LogLevel = 'info', write: (line: string, lvl: LogLevel) => void = defaultWrite): Logger {
  const emit = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] < ORDER[level]) return;
    write(JSON.stringify({time: new Date().toISOString(), level: lvl, msg, ...fields}), lvl);
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  };
}

function defaultWrite(line: string, lvl: LogLevel) {
  (lvl === 'error' || lvl === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}

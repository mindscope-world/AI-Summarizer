import 'dotenv/config';
import {createApp} from './app';
import {EnvError, loadEnv, type Env} from './lib/env';
import {createLogger} from './lib/logger';

let env: Env;
try {
  env = loadEnv();
} catch (err) {
  if (err instanceof EnvError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const logger = createLogger(env.LOG_LEVEL);
const app = createApp({env, logger});

const server = app.listen(env.PORT, () => {
  logger.info('server_started', {port: env.PORT, environment: env.NODE_ENV});
});

function shutdown(signal: string) {
  logger.info('server_stopping', {signal});
  server.close(() => process.exit(0));
  // Don't hang forever on open keep-alive connections.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Anything that escapes a request handler is a bug: record it (so it shows up in the platform's error
// monitoring, which reads these JSON lines) and exit, so the orchestrator starts a clean process.
function fatal(kind: string, err: unknown) {
  logger.error(kind, {error: err instanceof Error ? {name: err.name, message: err.message, stack: err.stack} : String(err)});
  process.exit(1);
}
process.on('uncaughtException', (err) => fatal('uncaught_exception', err));
process.on('unhandledRejection', (reason) => fatal('unhandled_rejection', reason));

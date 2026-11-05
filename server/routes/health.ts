import {Router} from 'express';
import type {HealthResponse} from '../../src/types';
import type {Env} from '../lib/env';
import {describeAi} from '../ai/model';
import {readVersion, SERVICE_NAME} from '../lib/meta';

export function createHealthRouter(env: Env): Router {
  const router = Router();
  const version = readVersion();

  router.get('/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      service: SERVICE_NAME,
      version,
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      ai: describeAi(env),
    };
    res.json(body);
  });

  return router;
}

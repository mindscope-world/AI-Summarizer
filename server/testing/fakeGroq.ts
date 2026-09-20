import type http from 'node:http';
import {startFixtureServer, type FixtureServer} from './httpServer';

export interface ChatCall {
  authorization: string | undefined;
  body: {
    model: string;
    temperature?: number;
    messages: {role: string; content: string | {type: string; text?: string; image_url?: {url: string}}[]}[];
  };
}

export type FakeReply =
  | string
  | {status: number; body?: unknown; headers?: Record<string, string>}
  | 'hang';

export interface FakeGroq extends FixtureServer {
  calls: ChatCall[];
}

/**
 * A stand-in for Groq's OpenAI-compatible chat endpoint, so tests can drive the real
 * LangChain client over HTTP. `reply` gets each request and the 0-based call index.
 */
export async function startFakeGroq(reply: (call: ChatCall, index: number) => FakeReply): Promise<FakeGroq> {
  const calls: ChatCall[] = [];
  const server = await startFixtureServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
        res.writeHead(404).end();
        return;
      }
      const call: ChatCall = {authorization: req.headers.authorization, body: JSON.parse(raw)};
      const index = calls.push(call) - 1;
      const r = reply(call, index);
      if (r === 'hang') return;
      if (typeof r === 'string') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(
          JSON.stringify({
            id: `chatcmpl-${index}`,
            object: 'chat.completion',
            created: 1,
            model: call.body.model,
            choices: [{index: 0, message: {role: 'assistant', content: r}, finish_reason: 'stop'}],
            usage: {prompt_tokens: 10, completion_tokens: 10, total_tokens: 20},
          }),
        );
        return;
      }
      res.writeHead(r.status, {'Content-Type': 'application/json', ...r.headers});
      res.end(JSON.stringify(r.body ?? {error: {message: 'upstream detail that must never reach users: sk-secret-body', type: 'x'}}));
    });
  });
  return Object.assign(server, {calls});
}

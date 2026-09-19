import http from 'node:http';
import type {AddressInfo} from 'node:net';

export interface FixtureServer {
  /** e.g. http://127.0.0.1:54321 */
  url: string;
  port: number;
  close(): Promise<void>;
}

/** Starts a throwaway local HTTP server for tests that need to fetch a URL. */
export async function startFixtureServer(handler: http.RequestListener): Promise<FixtureServer> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

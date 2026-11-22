import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequestHandler } from "../../src/app.js";
import type { Clock } from "../../src/clock.js";
import { parseConfig, type OwnerConfig } from "../../src/config.js";
import type { Database } from "../../src/db/schema.js";

export type TestServer = {
  server: Server;
  baseUrl: string;
};

export type TestServerOptions = {
  db: Database;
  clock: Clock;
  owner?: OwnerConfig;
};

export async function startTestServer({
  db,
  clock,
  owner = parseConfig({}).owner,
}: TestServerOptions): Promise<TestServer> {
  const requestHandler = createRequestHandler({ db, owner, clock });
  const server = createServer(requestHandler);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;

  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

export async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

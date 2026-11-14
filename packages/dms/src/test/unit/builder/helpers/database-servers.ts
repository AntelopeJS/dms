import { execFile, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import diagnosticsChannel from "node:diagnostics_channel";
import net from "node:net";
import { promisify } from "node:util";
import { z } from "zod";

const run = promisify(execFile);
const PORT_MAPPING = /:(\d+)\s*$/;
const RANDOM_BYTES = 4;
const POLL_MS = 300;
const READY_TIMEOUT_MS = 90_000;

/**
 * Whether a Docker daemon answers and runs Linux containers: the live checks
 * run the engines' own images, which publish no Windows variant.
 */
export const dockerAvailable =
  spawnSync("docker", ["version", "--format", "{{.Server.Os}}"], {
    encoding: "utf8",
  }).stdout?.trim() === "linux";

/** What a title says when the live checks cannot run, so a skipped suite names its reason. */
export const LIVE_SUITE_NOTE = dockerAvailable
  ? ""
  : " (skipped: no Docker daemon runs Linux containers)";

/** How long a hook may take to start an image and for its server to answer. */
export const START_TIMEOUT_MS = 180_000;

/** A running database server and the local port it answers on. */
export interface Container {
  name: string;
  port: number;
}

/** Starts `image` with its `containerPort` published on a free local port. */
export async function startContainer(
  image: string,
  containerPort: number,
  runArguments: string[] = [],
  command: string[] = [],
): Promise<Container> {
  const name = `dms-check-${process.pid}-${randomBytes(RANDOM_BYTES).toString("hex")}`;
  await run("docker", [
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    "-p",
    `127.0.0.1::${containerPort}`,
    ...runArguments,
    image,
    ...command,
  ]);
  const { stdout } = await run("docker", [
    "port",
    name,
    `${containerPort}/tcp`,
  ]);
  const port = Number(PORT_MAPPING.exec(stdout.split("\n")[0] ?? "")?.[1]);
  return { name, port };
}

/** Stops and removes a server, whatever state it is in. */
export async function removeContainer(
  container: Container | undefined,
): Promise<void> {
  if (container) {
    await run("docker", ["rm", "-f", container.name]).catch(() => undefined);
  }
}

/** Polls `ready` until it answers `true`; it must catch what a server still starting throws. */
export async function waitFor(
  what: string,
  ready: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await ready()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`${what} did not answer within ${READY_TIMEOUT_MS} ms`);
}

const TcpAddress = z.object({ port: z.number() });

function portOf(server: net.Server): number {
  return TcpAddress.parse(server.address()).port;
}

/** A local port nothing listens on. */
export async function closedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = portOf(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** A server that accepts connections and never says a word, as a host behind a dropped packet does. */
export async function silentServer(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: portOf(server),
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/**
 * What a relay asks of each chunk of one connection, from the client or from the server: `true`
 * once the connection has gone quiet, from this chunk on.
 */
export type Stall = (chunk: Buffer, fromClient: boolean) => boolean;

/** A relay in front of a database server, and the sockets clients hold open to it. */
export interface Relay {
  port: number;
  /** The sockets still open to the relay once none has closed for a moment, or after `settleMs`. */
  openAfter: (settleMs: number) => Promise<number>;
  close: () => Promise<void>;
}

const SETTLE_POLL_MS = 20;

/** How long a test lets a relay settle before it counts the sockets still open. */
export const CLOSE_SETTLE_MS = 1000;

async function startRelay(
  targetPort: number,
  newStall: (() => Stall) | undefined,
  ignoresGoodbye: boolean,
): Promise<Relay> {
  const clients = new Set<net.Socket>();
  const upstreams = new Set<net.Socket>();
  const server = net.createServer(
    { allowHalfOpen: ignoresGoodbye },
    (client) => {
      const upstream = net.connect(targetPort, "127.0.0.1");
      const stall = newStall?.();
      let stalled = false;
      if (ignoresGoodbye) {
        client.on("end", () => {
          stalled = true;
        });
      }
      const forward = (chunk: Buffer, fromClient: boolean) => {
        stalled = stalled || (stall?.(chunk, fromClient) ?? false);
        if (!stalled) {
          (fromClient ? upstream : client).write(chunk);
        }
      };
      clients.add(client);
      upstreams.add(upstream);
      client.on("data", (chunk) => forward(Buffer.from(chunk), true));
      upstream.on("data", (chunk) => forward(Buffer.from(chunk), false));
      client.on("close", () => {
        clients.delete(client);
        upstream.destroy();
      });
      upstream.on("close", () => {
        upstreams.delete(upstream);
        if (!stalled) {
          client.destroy();
        }
      });
      client.on("error", () => undefined);
      upstream.on("error", () => undefined);
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: portOf(server),
    openAfter: async (settleMs) => {
      const until = Date.now() + settleMs;
      while (clients.size > 0 && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
      }
      return clients.size;
    },
    close: async () => {
      for (const socket of [...clients, ...upstreams]) {
        socket.destroy();
      }
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/**
 * Forwards each connection to the server on `targetPort`. A connection whose `Stall` answers
 * `true` forwards nothing more in either direction and closes nothing, as a server does when it
 * hangs after signing a client in.
 */
export function relay(
  targetPort: number,
  newStall?: () => Stall,
): Promise<Relay> {
  return startRelay(targetPort, newStall, false);
}

/**
 * Forwards each connection to the server on `targetPort` until the client says goodbye: a chunk
 * `goodbye` accepts, or the client ending its side of the connection. From then on it forwards
 * nothing and closes nothing, as a server does that ignores a client leaving.
 */
export function relayIgnoringGoodbye(
  targetPort: number,
  goodbye: Stall = () => false,
): Promise<Relay> {
  return startRelay(targetPort, () => goodbye, true);
}

const ClientSocketMessage = z.object({ socket: z.instanceof(net.Socket) });

/** The client sockets this process opens to one port, whichever library opens them. */
export interface ClientSockets {
  /** How many of them are not destroyed once all have been, or after `settleMs`. */
  leftOpenAfter: (settleMs: number) => Promise<number>;
  stop: () => void;
}

/** Watches the client sockets this process opens to `port` from now on. */
export function watchClientSockets(port: number): ClientSockets {
  const sockets = new Set<net.Socket>();
  const track: diagnosticsChannel.ChannelListener = (message) => {
    const { socket } = ClientSocketMessage.parse(message);
    socket.once("connect", () => {
      if (socket.remotePort === port) {
        sockets.add(socket);
      }
    });
  };
  const leftOpen = () =>
    [...sockets].filter((socket) => !socket.destroyed).length;
  diagnosticsChannel.subscribe("net.client.socket", track);
  return {
    leftOpenAfter: async (settleMs) => {
      const until = Date.now() + settleMs;
      while (leftOpen() > 0 && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
      }
      return leftOpen();
    },
    stop: () => {
      diagnosticsChannel.unsubscribe("net.client.socket", track);
    },
  };
}

const RUN_SECRET = randomBytes(6).toString("hex");

/** A throwaway secret for `name`, random for each test run, so no credential sits in the source. */
export function secretOf(name: string): string {
  return `${name}-${RUN_SECRET}`;
}

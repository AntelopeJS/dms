/** How long a connection may take to close before the check shuts its socket. */
export const CLOSE_GRACE_MS = 250;

type Closer = () => Promise<void>;
type Destroyer = () => void;

interface Connection {
  close: Closer;
  destroy?: Destroyer;
}

function destroyQuietly(destroy: Destroyer): void {
  try {
    destroy();
  } catch {
    return;
  }
}

function closeWithinGrace({ close, destroy }: Connection): void {
  const timer =
    destroy === undefined
      ? undefined
      : setTimeout(() => destroyQuietly(destroy), CLOSE_GRACE_MS);
  timer?.unref();
  try {
    close().then(
      () => clearTimeout(timer),
      () => undefined,
    );
  } catch {
    return;
  }
}

/**
 * What a probe has opened, which the check closes once the probe has answered and when its
 * deadline passes, whatever the probe is waiting for. A probe registers each client as it opens
 * it, so no socket outlives the answer because a client library bounds only its connecting.
 */
export class ProbeConnections {
  private connections: Connection[] = [];
  private closed = false;

  /**
   * Registers a connection: `close` says goodbye the way its client library does, and is called at
   * once when the check has closed its connections already. `destroy` shuts its socket, and is
   * called when `close` has not finished after the grace or has failed; a library whose `close`
   * shuts the socket itself, without waiting for the server, needs none.
   */
  add(close: Closer, destroy?: Destroyer): void {
    if (this.closed) {
      closeWithinGrace({ close, destroy });
      return;
    }
    this.connections.push({ close, destroy });
  }

  /**
   * Starts closing each registered connection and returns at once: an answer never waits for a
   * server to close its end. A connection that fails to close, or whose `destroy` throws, is ignored.
   */
  closeAll(): void {
    this.closed = true;
    for (const connection of this.connections.splice(0)) {
      closeWithinGrace(connection);
    }
  }
}

/**
 * The writes running, by the key of the event they write: a write of that
 * event waits for them (one write of an event at a time, an Undo included).
 */
export class AgendaInFlight {
  private readonly running = new Map<string, Promise<unknown>>();

  /** Runs a request, known as running for each key until it settles. */
  track<T>(keys: string[], request: Promise<T>): Promise<T> {
    const settled = request.catch(() => undefined);
    for (const key of keys) this.running.set(key, settled);
    void settled.then(() => {
      for (const key of keys)
        if (this.running.get(key) === settled) this.running.delete(key);
    });
    return request;
  }

  has(key: string): boolean {
    return this.running.has(key);
  }

  /** Resolves once no write of these keys runs any more. */
  async settled(keys: string[]): Promise<void> {
    const running = keys
      .map((key) => this.running.get(key))
      .filter((promise): promise is Promise<unknown> => promise !== undefined);
    if (running.length) await Promise.all(running);
  }
}

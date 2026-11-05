import { expect } from "chai";
import { createLookupCache } from "../../../store";

const LIFETIMES = { found: 1000, failed: 100 };
const WAITING = Symbol("waiting");

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function settledOrWaiting<T>(read: Promise<T>): Promise<T | typeof WAITING> {
  return Promise.race([
    read,
    new Promise<typeof WAITING>((settle) => {
      setImmediate(() => settle(WAITING));
    }),
  ]);
}

describe("[unit] store/cache", () => {
  const realNow = Date.now;
  let now = 0;

  beforeEach(() => {
    now = realNow();
    Date.now = () => now;
  });

  afterEach(() => {
    Date.now = realNow;
  });

  it("answers a stale read with an expired value and replaces it in the background", async () => {
    const cache = createLookupCache<string>(LIFETIMES);
    await cache.get("pkg", () => Promise.resolve("v1"));
    now += LIFETIMES.found + 1;
    const registry = deferred<string>();

    const read = await settledOrWaiting(
      cache.get("pkg", () => registry.promise, { freshness: "stale" }),
    );
    expect(read).to.equal("v1");

    registry.resolve("v2");
    await registry.promise;
    await new Promise((settle) => setImmediate(settle));
    expect(await cache.get("pkg", () => Promise.resolve("not asked"))).to.equal(
      "v2",
    );
  });

  it("makes a stale read wait for the source once a failed lookup expires", async () => {
    const cache = createLookupCache<string>(LIFETIMES);
    await cache.get("pkg", () => Promise.reject(new Error("registry down")));
    now += LIFETIMES.failed + 1;
    const registry = deferred<string>();

    const read = cache.get("pkg", () => registry.promise, {
      freshness: "stale",
    });
    expect(await settledOrWaiting(read)).to.equal(WAITING);

    registry.resolve("v1");
    expect(await read).to.equal("v1");
  });

  it("makes a default read wait for the source once an answer expires", async () => {
    const cache = createLookupCache<string>(LIFETIMES);
    await cache.get("pkg", () => Promise.resolve("v1"));
    now += LIFETIMES.found + 1;
    const registry = deferred<string>();

    const read = cache.get("pkg", () => registry.promise);
    expect(await settledOrWaiting(read)).to.equal(WAITING);

    registry.resolve("v2");
    expect(await read).to.equal("v2");
  });

  it("makes a fresh read wait for a new lookup, even with a fresh value", async () => {
    const cache = createLookupCache<string>(LIFETIMES);
    await cache.get("pkg", () => Promise.resolve("v1"));
    const registry = deferred<string>();

    const read = cache.get("pkg", () => registry.promise, {
      freshness: "fresh",
    });
    expect(await settledOrWaiting(read)).to.equal(WAITING);

    registry.resolve("v2");
    expect(await read).to.equal("v2");
  });
});

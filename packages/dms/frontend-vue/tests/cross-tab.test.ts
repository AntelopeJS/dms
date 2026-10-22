import { describe, expect, it, vi } from "vitest";
import {
  electLeader,
  holdLock,
  shareAcrossTabs,
  whenReleased,
} from "../layers/dms-core/app/build/utils/crossTab";
import { createFakeBrowser } from "./fixtures/fakeBrowser";

const NAME = "test-source";

const flush = async (): Promise<void> => {
  for (let round = 0; round < 5; round += 1) await Promise.resolve();
};

describe("electLeader", () => {
  it("runs one leader at a time and hands over in order when it resigns", async () => {
    const browser = createFakeBrowser();
    const leading: string[] = [];
    const elect = (tab: string) =>
      electLeader(NAME, browser.openTab().environment, () => {
        leading.push(tab);
        return () => leading.splice(leading.indexOf(tab), 1);
      });
    const resignFirst = elect("first");
    elect("second");
    elect("third");
    await flush();
    expect(leading).toEqual(["first"]);

    resignFirst();
    await flush();
    expect(leading).toEqual(["second"]);
  });

  it("stops waiting once a waiting tab resigns", async () => {
    const browser = createFakeBrowser();
    const lead = vi.fn(() => () => {});
    const resignFirst = electLeader(NAME, browser.openTab().environment, lead);
    const resignSecond = electLeader(NAME, browser.openTab().environment, lead);
    await flush();

    resignSecond();
    resignFirst();
    await flush();

    expect(lead).toHaveBeenCalledOnce();
    expect(browser.locks.isHeld(NAME)).toBe(false);
  });

  it("makes every tab its own leader without Web Locks", () => {
    const lead = vi.fn(() => () => {});
    electLeader(NAME, {}, lead);
    electLeader(NAME, {}, lead);
    expect(lead).toHaveBeenCalledTimes(2);
  });
});

describe("whenReleased", () => {
  it("fires once the tab holding the lock lets it go, not before", async () => {
    const browser = createFakeBrowser();
    const held = holdLock("tab-1", browser.openTab().environment);
    await held.held;
    const onReleased = vi.fn();
    whenReleased(
      "tab-1",
      browser.openTab().environment,
      onReleased,
      new AbortController().signal,
    );
    await flush();
    expect(onReleased).not.toHaveBeenCalled();

    held.release();
    await flush();
    expect(onReleased).toHaveBeenCalledOnce();
  });

  it("never fires once aborted", async () => {
    const browser = createFakeBrowser();
    const held = holdLock("tab-1", browser.openTab().environment);
    await held.held;
    const watching = new AbortController();
    const onReleased = vi.fn();
    whenReleased(
      "tab-1",
      browser.openTab().environment,
      onReleased,
      watching.signal,
    );

    watching.abort();
    held.release();
    await flush();
    expect(onReleased).not.toHaveBeenCalled();
  });
});

describe("shareAcrossTabs", () => {
  it("opens the source once and relays what it emits to every tab", async () => {
    const browser = createFakeBrowser();
    let emit: ((message: unknown) => void) | undefined;
    const open = vi.fn((relay: (message: unknown) => void) => {
      emit = relay;
      return () => {};
    });
    const received = [vi.fn(), vi.fn(), vi.fn()];
    for (const onMessage of received) {
      shareAcrossTabs(NAME, open, onMessage, browser.openTab().environment);
    }
    await flush();

    emit!("ping");
    await flush();

    expect(open).toHaveBeenCalledOnce();
    for (const onMessage of received) {
      expect(onMessage).toHaveBeenCalledExactlyOnceWith("ping");
    }
  });

  it("reopens the source in the next tab when the leader leaves", async () => {
    const browser = createFakeBrowser();
    const close = vi.fn();
    const open = vi.fn(() => close);
    const leaveFirst = shareAcrossTabs(
      NAME,
      open,
      () => {},
      browser.openTab().environment,
    );
    shareAcrossTabs(NAME, open, () => {}, browser.openTab().environment);
    await flush();

    leaveFirst();
    await flush();

    expect(close).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledTimes(2);
  });
});

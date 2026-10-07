import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive } from "vue";
import { combineSaveStates } from "../layers/dms-layout/app/composables/layout/useInstantSaveHeader";
import {
  INSTANT_SAVE_DEBOUNCE_MS,
  INSTANT_SAVED_STATE_MS,
  useInstantSave,
} from "../layers/dms-ui/app/build/composables/instant-save/useInstantSave";

interface Settings extends Record<string, unknown> {
  name: string;
  theme: string;
  digest: boolean;
}

/** A server that answers when told to: each save waits for `settle`. */
function deferredServer() {
  const calls: Array<{
    changes: Partial<Settings>;
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];
  const save = vi.fn(
    (changes: Partial<Settings>) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ changes, resolve, reject });
      }),
  );
  return { calls, save };
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await nextTick();
  await Promise.resolve();
}

function setup(save: (changes: Partial<Settings>) => Promise<void>) {
  const values = reactive<Settings>({
    name: "Acme",
    theme: "light",
    digest: true,
  });
  const onError = vi.fn();
  const scope = effectScope();
  const instant = scope.run(() =>
    useInstantSave<Settings>({
      read: (key) => values[key],
      write: (key, value) => {
        (values as Record<string, unknown>)[key] = value;
      },
      save,
      onError,
    }),
  )!;
  return { values, instant, onError, scope };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useInstantSave", () => {
  it("saves a pick at once, alone, and shows saving then saved", async () => {
    const server = deferredServer();
    const { values, instant } = setup(server.save);

    instant.change("theme", "dark");
    expect(values.theme).toBe("dark");
    expect(server.save).toHaveBeenCalledWith({ theme: "dark" });
    expect(instant.states.theme).toBe("saving");

    server.calls[0]!.resolve();
    await settle();
    expect(instant.states.theme).toBe("saved");

    vi.advanceTimersByTime(INSTANT_SAVED_STATE_MS);
    expect(instant.states.theme).toBe("idle");
  });

  it("waits for typing to pause before saving text, then sends the last value", async () => {
    const server = deferredServer();
    const { instant } = setup(server.save);

    instant.change("name", "A", { debounce: true });
    instant.change("name", "Ac", { debounce: true });
    vi.advanceTimersByTime(INSTANT_SAVE_DEBOUNCE_MS - 1);
    expect(server.save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(server.save).toHaveBeenCalledTimes(1);
    expect(server.save).toHaveBeenCalledWith({ name: "Ac" });
  });

  it("puts the last confirmed value back when a save fails, then retries", async () => {
    const server = deferredServer();
    const { values, instant, onError } = setup(server.save);

    instant.change("theme", "dark");
    const refusal = new Error("refused");
    server.calls[0]!.reject(refusal);
    await settle();

    expect(values.theme).toBe("light");
    expect(instant.states.theme).toBe("error");
    expect(instant.failed.value).toEqual({ theme: "dark" });
    expect(onError).toHaveBeenCalledWith(refusal, { theme: "dark" });

    instant.retry();
    expect(values.theme).toBe("dark");
    expect(server.save).toHaveBeenLastCalledWith({ theme: "dark" });
    server.calls[1]!.resolve();
    await settle();
    expect(instant.failed.value).toBeNull();
    expect(instant.states.theme).toBe("saved");
  });

  it("rolls back to what the server last confirmed, not what was shown first", async () => {
    const server = deferredServer();
    const { values, instant } = setup(server.save);

    instant.change("theme", "dark");
    server.calls[0]!.resolve();
    await settle();
    instant.change("theme", "blue");
    server.calls[1]!.reject(new Error("refused"));
    await settle();

    expect(values.theme).toBe("dark");
  });

  it("sends a change made while a save of its key runs once that one ends", async () => {
    const server = deferredServer();
    const { values, instant } = setup(server.save);

    instant.change("theme", "dark");
    instant.change("theme", "blue");
    expect(server.save).toHaveBeenCalledTimes(1);

    server.calls[0]!.resolve();
    await settle();
    expect(server.save).toHaveBeenLastCalledWith({ theme: "blue" });
    expect(values.theme).toBe("blue");
  });

  it("keeps a newer value on screen when an older save of its key fails", async () => {
    const server = deferredServer();
    const { values, instant } = setup(server.save);

    instant.change("theme", "dark");
    instant.change("theme", "blue");
    server.calls[0]!.reject(new Error("refused"));
    await settle();

    expect(values.theme).toBe("blue");
  });

  it("saves several keys in one request", () => {
    const server = deferredServer();
    const { instant } = setup(server.save);

    instant.changeMany({ theme: "dark", digest: false });
    expect(server.save).toHaveBeenCalledWith({ theme: "dark", digest: false });
    expect(instant.states.theme).toBe("saving");
    expect(instant.states.digest).toBe("saving");
  });

  it("leaves a text still being typed out of a save of several keys", () => {
    const server = deferredServer();
    const { instant } = setup(server.save);

    instant.change("name", "Acme Inc", { debounce: true });
    instant.changeMany({ theme: "dark" });
    expect(server.save).toHaveBeenCalledTimes(1);
    expect(server.save).toHaveBeenCalledWith({ theme: "dark" });

    vi.advanceTimersByTime(INSTANT_SAVE_DEBOUNCE_MS);
    expect(server.save).toHaveBeenLastCalledWith({ name: "Acme Inc" });
  });

  it("queues a value the source already shows, from the confirmed one", async () => {
    const server = deferredServer();
    const { values, instant } = setup(server.save);
    instant.confirm({ name: "Acme" });

    values.name = "Typed";
    instant.queue("name", "Typed");
    server.calls[0]!.reject(new Error("refused"));
    await settle();

    expect(values.name).toBe("Acme");
  });

  it("sends a pending change at once when flushed", () => {
    const server = deferredServer();
    const { instant } = setup(server.save);

    instant.change("name", "Acme Inc", { debounce: true });
    void instant.flush();
    expect(server.save).toHaveBeenCalledWith({ name: "Acme Inc" });
  });

  it("drops a pending change once cancelled", () => {
    const server = deferredServer();
    const { instant } = setup(server.save);

    instant.change("name", "Acme Inc", { debounce: true });
    instant.cancel("name");
    vi.advanceTimersByTime(INSTANT_SAVE_DEBOUNCE_MS);
    expect(server.save).not.toHaveBeenCalled();
  });

  it("reads one state for the page: saving, then error, then saved", () => {
    expect(combineSaveStates(["saved", "error", "saving"])).toBe("saving");
    expect(combineSaveStates(["saved", "error", "idle"])).toBe("error");
    expect(combineSaveStates(["idle", "saved", undefined])).toBe("saved");
    expect(combineSaveStates([])).toBe("idle");
  });
});

import type { ProcessEventMap } from "node:process";
import { afterEach, beforeEach, expect, it } from "vitest";
import { effectScope, nextTick, reactive } from "vue";
import { useInstantSave } from "../layers/dms-ui/app/entries/composables/instant-save/useInstantSave";

interface Settings {
  theme: string;
}

type Rejection = ProcessEventMap["unhandledRejection"][0];

const unhandled: Rejection[] = [];

function remember(reason: Rejection): void {
  unhandled.push(reason);
}

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", remember);
});

afterEach(() => {
  process.off("unhandledRejection", remember);
});

it("settles a refused save whose error handler throws, with no rejection left unhandled (fails on a detached save that is not caught)", async () => {
  const values = reactive<Settings>({ theme: "light" });
  const handlerFailure = new Error("handler failed");
  const instant = effectScope().run(() =>
    useInstantSave<Settings>({
      read: (key) => values[key],
      write: (key, value) => {
        values[key] = value;
      },
      save: () => Promise.reject(new Error("refused")),
      onError: () => {
        throw handlerFailure;
      },
    }),
  )!;

  instant.change("theme", "dark");
  for (let tick = 0; tick < 4; tick++) await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(values.theme).toBe("light");
  expect(instant.states.theme).toBe("error");
  expect(unhandled).toEqual([]);
});

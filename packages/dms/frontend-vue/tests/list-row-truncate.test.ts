/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import ListRow from "../layers/dms-ui/app/components/list-row/ListRow.vue";

const LONG_TITLE = "Safari on iPhone 15 with a very long device name";

let app: App | undefined;
let host: HTMLDivElement;

async function mount(truncate: boolean) {
  app = createApp({
    render: () => h(ListRow, { title: LONG_TITLE, truncate }),
  });
  app.mount(host);
  await nextTick();
}

const titleText = () =>
  [...host.querySelectorAll("span")].find(
    (span) => span.textContent?.trim() === LONG_TITLE,
  );

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

describe("DmsListRow truncate", () => {
  it("puts the ellipsis on the title text, not on its flex container", async () => {
    await mount(true);
    expect(titleText()?.classList.contains("truncate")).toBe(true);
    expect(titleText()?.parentElement?.title).toBe(LONG_TITLE);
  });

  it("leaves the title text alone without truncate", async () => {
    await mount(false);
    expect(titleText()?.classList.contains("truncate")).toBe(false);
  });
});

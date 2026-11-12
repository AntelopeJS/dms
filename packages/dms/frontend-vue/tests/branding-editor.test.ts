/** @vitest-environment jsdom */
/**
 * The Branding editor against fake `/api/branding` routes: Save sends the
 * whole draft with the picked logos and the version it was made on, Discard
 * puts the files back, a stale save offers to reload, and an unsaved draft
 * kept on the device comes back on top of newer files.
 */
import type { App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buttonNamed,
  changeCountText,
  installBrandingRuntime,
  mountEditor,
  pickFile,
  settle,
  type BrandingCall,
} from "./helpers/branding-editor";

const THEME_URL = "/api/branding/theme";

function files(version: string, colors: Record<string, string> = {}) {
  return {
    layer: { name: "project", sourcePath: "/project/frontend-vue" },
    variables: { shared: {}, light: {}, dark: {} },
    colors,
    logos: {},
    version,
  };
}

const ok = (data: unknown) => ({ ok: true, data });

let app: App | undefined;

async function openEditor(
  answer: (call: BrandingCall) => unknown,
  viewer: { owner?: boolean } = {},
) {
  const runtime = installBrandingRuntime(answer, viewer);
  const { default: BrandingEditor } = await import(
    "../layers/dms-layout/app/entries/branding/BrandingEditor"
  );
  const mounted = await mountEditor(BrandingEditor);
  app = mounted.app;
  return { ...runtime, host: mounted.host };
}

const puts = (calls: BrandingCall[]) =>
  calls.filter((call) => call.method === "PUT");

beforeEach(() => localStorage.clear());

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Save", () => {
  it("sends the draft with its uploads and the version read, then counts no change", async () => {
    let onDisk = files("v1");
    const { host, calls } = await openEditor((call) => {
      if (call.method === "PUT") {
        onDisk = {
          ...files("v2"),
          variables: {
            shared: { "--ui-radius": "0.5rem", "--dms-radius-card": "1.25rem" },
            light: {},
            dark: {},
          },
        };
        return ok({ version: "v2" });
      }
      return ok(onDisk);
    });
    buttonNamed(host, "Round").click();
    const lightTile = host.querySelectorAll('input[type="file"]')[0];
    await pickFile(
      lightTile!,
      new File([new Uint8Array([137, 80, 78, 71])], "logo.png", {
        type: "image/png",
      }),
    );
    expect(changeCountText(host)).toBe("6 changes");

    buttonNamed(host, "Save").click();
    await settle();

    const [sent] = puts(calls);
    expect(sent?.url).toBe(THEME_URL);
    expect(sent?.body).toMatchObject({
      expectedVersion: "v1",
      draft: {
        variables: {
          shared: { "--ui-radius": "0.5rem", "--dms-radius-card": "1.25rem" },
        },
      },
    });
    const uploads = (sent?.body as { draft: { uploads: unknown[] } }).draft
      .uploads;
    expect(uploads).toHaveLength(4);
    expect(uploads[0]).toEqual({
      slot: "default",
      mode: "light",
      contentType: "image/png",
      base64Content: "iVBORw==",
    });
    expect(changeCountText(host)).toBe("No changes");
  });
});

describe("Discard", () => {
  it("puts the theme files' values back after the confirmation", async () => {
    const { host, confirm } = await openEditor(() => ok(files("v1")));
    buttonNamed(host, "Palette violet").click();
    await settle();
    expect(changeCountText(host)).toBe("1 change");

    buttonNamed(host, "Discard").click();
    await settle();

    expect(confirm).toHaveBeenCalledOnce();
    expect(changeCountText(host)).toBe("No changes");
    expect(buttonNamed(host, "Palette dms").getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("a stale save", () => {
  it("shows the reload banner, and Reload keeps the change on top of the new files", async () => {
    let onDisk = files("v1");
    const { host, calls } = await openEditor((call) => {
      if (call.method !== "PUT") return ok(onDisk);
      if (
        call.body &&
        (call.body as { expectedVersion: string }).expectedVersion === "v1"
      ) {
        onDisk = files("v2", { info: "sky" });
        return {
          ok: false,
          error: { code: "stale", ref: "theme", currentVersion: "v2" },
        };
      }
      return ok({ version: "v3" });
    });
    buttonNamed(host, "Palette violet").click();
    await settle();
    buttonNamed(host, "Save").click();
    await settle();
    expect(host.querySelector("[data-stale]")).not.toBeNull();

    buttonNamed(host, "Reload").click();
    await settle();
    expect(host.querySelector("[data-stale]")).toBeNull();
    expect(changeCountText(host)).toBe("1 change");

    buttonNamed(host, "Save").click();
    await settle();
    expect(puts(calls)[1]?.body).toMatchObject({
      expectedVersion: "v2",
      draft: { colors: { primary: "violet", info: "sky" } },
    });
  });
});

describe("the draft kept on the device", () => {
  it("comes back on open, rebased onto files that changed since", async () => {
    const { storeDraft, editOf, setColor } = await import(
      "../layers/dms-layout/app/entries/branding/model"
    );
    const kept = setColor(
      editOf({ theme: files("v0"), version: "v0" }),
      "primary",
      "violet",
    );
    await storeDraft(kept);

    const { host, calls } = await openEditor((call) =>
      call.method === "PUT"
        ? ok({ version: "v2" })
        : ok(files("v1", { info: "sky" })),
    );
    expect(changeCountText(host)).toBe("1 change");

    buttonNamed(host, "Save").click();
    await settle();
    expect(puts(calls)[0]?.body).toMatchObject({
      expectedVersion: "v1",
      draft: { colors: { primary: "violet", info: "sky" } },
    });
  });
});

describe("Access", () => {
  it("shows a viewer who does not own the platform the access-denied page, and reads nothing", async () => {
    const { calls, showDmsError } = await openEditor(() => ok(files("v1")), {
      owner: false,
    });
    expect(showDmsError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
    expect(calls).toEqual([]);
  });

  it("shows a refused read as a banner instead of loading forever", async () => {
    const { host } = await openEditor(() => {
      throw new Error("403 Forbidden");
    });
    const banner = host.querySelector("[data-refused]");
    expect(banner?.textContent).toContain("403 Forbidden");
  });
});

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
      editOf({
        theme: files("v0"),
        version: "v0",
        layer: "/project/frontend-vue",
      }),
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

describe("the draft kept on the device, across projects and lost logos", () => {
  it("does not open on another project, and keeps the draft for its own", async () => {
    const { storeDraft, storedDraft, editOf, setColor } = await import(
      "../layers/dms-layout/app/entries/branding/model"
    );
    await storeDraft(
      setColor(
        editOf({ theme: files("a1"), version: "a1", layer: "/work/a" }),
        "primary",
        "violet",
      ),
    );

    const { host, calls } = await openEditor(() => ok(files("b1")));
    expect(changeCountText(host)).toBe("No changes");
    expect(puts(calls)).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(storedDraft("/work/a")?.draft.colors.primary).toBe("violet");
  });

  it("keeps the saved logo when a picked logo's bytes did not come back", async () => {
    const { storeDraft, editOf, placeLogos } = await import(
      "../layers/dms-layout/app/entries/branding/model"
    );
    const savedLogo = "/branding/default-light-0a1b2c3d.svg";
    const withLogo = {
      ...files("v1"),
      logos: { default: { light: savedLogo } },
    };
    await storeDraft(
      placeLogos(
        editOf({
          theme: withLogo,
          version: "v1",
          layer: "/project/frontend-vue",
        }),
        [
          {
            slot: "default",
            mode: "light",
            logo: {
              contentType: "image/png",
              fileName: "new.png",
              base64Content: "iVBORw0KGgo=",
            },
          },
        ],
      ),
    );

    const { host } = await openEditor(() => ok(withLogo));
    expect(changeCountText(host)).toBe("No changes");
  });
});

describe("the drafts of two projects on one device", () => {
  it("keeps project A's draft when project B stores one of its own", async () => {
    const { storeDraft, storedDraft, editOf, setColor } = await import(
      "../layers/dms-layout/app/entries/branding/model"
    );
    const on = (layer: string, palette: string) =>
      setColor(
        editOf({ theme: files("v1"), version: "v1", layer }),
        "primary",
        palette,
      );
    await storeDraft(on("/work/a", "violet"));
    await storeDraft(on("/work/b", "sky"));
    expect(storedDraft("/work/a")?.draft.colors.primary).toBe("violet");
    expect(storedDraft("/work/b")?.draft.colors.primary).toBe("sky");
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

describe("Preview logo", () => {
  it("asks again for a saved logo the dev server did not serve yet", async () => {
    const { host } = await openEditor(() =>
      ok({
        ...files("v1"),
        logos: { default: { light: "/branding/logo-1.svg" } },
      }),
    );
    const logo = host.querySelector("[data-preview-logo]");
    expect(logo?.getAttribute("src")).toBe("/branding/logo-1.svg");
    logo?.dispatchEvent(new Event("error"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await settle();
    expect(host.querySelector("[data-preview-logo]")?.getAttribute("src")).toBe(
      "/branding/logo-1.svg?attempt=1",
    );
  });
});

describe("Leaving while the site layout loads", () => {
  it("reads no theme and leaves no font rules once the editor is gone", async () => {
    let release: () => void = () => undefined;
    const { calls } = installBrandingRuntime(() => ok(files("v1")));
    vi.stubGlobal("useSiteLayout", () => ({
      siteLayout: { value: undefined },
      loadSiteLayout: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    }));
    const { default: BrandingEditor } = await import(
      "../layers/dms-layout/app/entries/branding/BrandingEditor"
    );
    const mounted = await mountEditor(BrandingEditor);
    mounted.app.unmount();
    release();
    await settle();
    expect(calls).toEqual([]);
    expect(document.getElementById("dms-branding-fonts")).toBeNull();
  });
});

describe("A site layout that fails to load", () => {
  it("leaves the error to the layout's own page: no theme read, no access-denied page", async () => {
    const { calls, showDmsError } = installBrandingRuntime(() =>
      ok(files("v1")),
    );
    vi.stubGlobal("useSiteLayout", () => ({
      siteLayout: { value: undefined },
      loadSiteLayout: () => Promise.reject(new Error("site layout 500")),
    }));
    const reported = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(reported);
    const error = vi.spyOn(console, "error").mockImplementation(reported);
    const { default: BrandingEditor } = await import(
      "../layers/dms-layout/app/entries/branding/BrandingEditor"
    );
    app = (await mountEditor(BrandingEditor)).app;
    warn.mockRestore();
    error.mockRestore();
    expect(calls).toEqual([]);
    expect(showDmsError).not.toHaveBeenCalled();
    expect(reported).not.toHaveBeenCalled();
  });
});

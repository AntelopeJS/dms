/** @vitest-environment jsdom */
/**
 * `useConfirmFrom().confirmFrom(url)` opens the dialog a route words, as a
 * declarative action's `confirm: { from }` does, for code of a module's own
 * (a custom page, a block's button).
 */
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";
import { useActionConfirm } from "../layers/dms-ui/app/build/composables/confirm/useActionConfirm";
import { useConfirmFrom } from "../layers/dms-ui/app/composables/confirm/useConfirmFrom";
import { isConfirmTextMatch } from "../layers/dms-ui/app/entries/composables/confirm/confirmTextMatch";
import type { NamedValue } from "vue-i18n";
import {
  readOnlyFailure,
  installReadOnlyRefusal,
} from "./helpers/read-only-refusal";

const authFetch = vi.fn();
const confirm = vi.fn(async () => true);
const addToast = vi.fn(() => ({ id: "failure" }));
let app: App | undefined;

function mountComposable<T>(use: () => T): T {
  let api: T | undefined;
  app = createApp(
    defineComponent({
      setup() {
        api = use();
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  return api!;
}

const mountConfirmFrom = () => mountComposable(useConfirmFrom);

beforeEach(() => {
  vi.stubEnv("SSR", false);
  authFetch.mockReset();
  confirm.mockClear();
  addToast.mockClear();
  const fetch = Object.assign(authFetch, { raw: vi.fn() });
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: fetch }));
  vi.stubGlobal("useConfirm", () => ({ confirm }));
  vi.stubGlobal("useToast", () => ({ add: addToast }));
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, params?: NamedValue) =>
      params?.name ? `${key}(${String(params.name)})` : key,
  }));
  vi.stubGlobal("interpolateUrl", interpolateUrl);
  vi.stubGlobal("Color", { error: "error" });
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("confirmFrom", () => {
  it("returns false on a marked refusal without a title-only local toast", async () => {
    installReadOnlyRefusal();
    authFetch.mockRejectedValue(readOnlyFailure());
    expect(await mountConfirmFrom().confirmFrom("/api/x")).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "error.read_only_demo",
        color: "warning",
      }),
    );
  });

  it("reads the dialog from the URL filled with the params and shows it", async () => {
    authFetch.mockResolvedValue({
      title: "$campaigns.delete_title",
      color: "error",
    });
    const onConfirm = vi.fn(async () => undefined);
    const confirmed = await mountConfirmFrom().confirmFrom(
      "/api/campaigns/{{row.id}}/delete-confirm",
      {
        params: { id: "c1", name: "Spring" },
        fallback: { icon: "i-ph-trash" },
        onConfirm,
      },
    );
    expect(confirmed).toBe(true);
    expect(authFetch).toHaveBeenCalledWith("/api/campaigns/c1/delete-confirm");
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "campaigns.delete_title(Spring)",
        color: "error",
        icon: "i-ph-trash",
        onConfirm,
      }),
    );
  });

  it("never resolves true for a blocked dialog", async () => {
    authFetch.mockResolvedValue({ title: "Cannot delete", blocked: true });
    expect(await mountConfirmFrom().confirmFrom("/api/x")).toBe(false);
  });

  it("toasts a failed read and resolves false", async () => {
    authFetch.mockRejectedValue(new Error("down"));
    expect(await mountConfirmFrom().confirmFrom("/api/x")).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledOnce();
  });
});

describe("confirmFrom on an answer its route's writers control", () => {
  it("leaves out the component the answer names, and still shows its texts and plain fields", async () => {
    authFetch.mockResolvedValue({
      title: "Approve the export?",
      component: {
        componentName: "dms-input-secret",
        options: { rotateUrl: "/api/builder/database/connections/check" },
      },
      fields: [
        {
          id: "note",
          type: "string",
          component: { componentName: "dms-input-text", options: {} },
        },
      ],
    });
    expect(await mountConfirmFrom().confirmFrom("/api/x")).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
    const shown = confirm.mock.calls[0]?.[0];
    expect(shown).not.toHaveProperty("component");
    expect(shown).toMatchObject({
      title: "Approve the export?",
      fields: [{ id: "note" }],
    });
  });

  it.each([
    ["a secret input that rotates through a POST", "dms-input-secret"],
    ["a form block", "dms-form-block"],
    ["a relation input that adds records", "DmsInputRelation"],
    ["a component of another module", "acme-widget"],
  ])(
    "refuses a dialog whose field is drawn by %s, toasting it",
    async (_input, componentName) => {
      authFetch.mockResolvedValue({
        title: "Renew the token?",
        fields: [
          {
            id: "token",
            type: "secret",
            component: {
              componentName,
              options: { rotateUrl: "/api/builder/database/connections/check" },
            },
          },
        ],
      });
      expect(await mountConfirmFrom().confirmFrom("/api/x")).toBe(false);
      expect(confirm).not.toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledOnce();
    },
  );

  it("shows a field drawn by a request-free built-in input, however its name is written", async () => {
    authFetch.mockResolvedValue({
      title: "Delete the role?",
      fields: [
        {
          id: "reassignTo",
          type: "select",
          component: {
            componentName: "DmsInputSelect",
            options: { items: [] },
          },
        },
      ],
    });
    expect(await mountConfirmFrom().confirmFrom("/api/x")).toBe(true);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [expect.objectContaining({ id: "reassignTo" })],
      }),
    );
  });

  it("keeps the component of a dialog declared in code", async () => {
    const component = { componentName: "acme-preview", options: { id: "p1" } };
    const { confirmAction } = mountComposable(useActionConfirm);
    expect(await confirmAction({ title: "Publish?", component })).toBe(true);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ component }),
    );
  });
});

describe("isConfirmTextMatch", () => {
  it("compares the trimmed text, ignoring case only when asked", () => {
    expect(isConfirmTextMatch(" ACME ", "ACME")).toBe(true);
    expect(isConfirmTextMatch("acme", "ACME")).toBe(false);
    expect(isConfirmTextMatch("acme", "ACME", true)).toBe(true);
    expect(isConfirmTextMatch("acmé", "ACME", true)).toBe(false);
  });
});

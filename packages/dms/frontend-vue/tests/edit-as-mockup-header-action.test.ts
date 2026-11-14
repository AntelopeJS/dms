import { computed, createApp, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dmsAppContext } from "./fixtures/dmsAppContext";
import type { HeaderAction } from "../layers/dms-layout/app/composables/useHeaderActions";

interface Toast {
  title?: string;
  actions?: Array<{ label?: string; onClick?: () => void }>;
}

const route = { path: "/books" };
const registered: HeaderAction[] = [];
const pushed: string[] = [];
const posted: Array<Record<string, unknown>> = [];
const toasts: Toast[] = [];
const presented: unknown[] = [];
const fallbackKeys: string[] = [];
let answers: unknown[] = [];

const MATCHED = new Set([
  "/books",
  "/mockup",
  "/mockups",
  "/dms-preview",
  "/branding",
]);

const isOwner = ref(true);

vi.stubGlobal("defineDmsPlugin", <Setup>(setup: Setup) => setup);
vi.stubGlobal("useIsOwner", () => computed(() => isOwner.value));
vi.stubGlobal("registerHeaderAction", (action: HeaderAction) =>
  registered.push(action),
);
vi.stubGlobal("useDmsRoute", () => route);
vi.stubGlobal("useDmsRouter", () => ({
  push: (url: string) => {
    pushed.push(url);
    return Promise.resolve();
  },
}));
vi.stubGlobal("useSiteLayout", () => ({
  findMatchingRoute: (path: string) =>
    MATCHED.has(path) ? { pattern: path } : null,
}));
vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: (url: string, init: { body: Record<string, unknown> }) => {
    posted.push({ url, ...init.body });
    const next = answers.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  },
}));
vi.stubGlobal("getAppTranslation", () => ({ t: (key: string) => key }));

const { default: plugin } = await import(
  "../layers/dms-layout/app/entries/mockup/header-action"
);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function action(): HeaderAction {
  registered.length = 0;
  plugin(dmsAppContext(createApp({ render: () => null })));
  const [only] = registered;
  if (!only) throw new Error("the plugin registered no header action");
  return only;
}

beforeEach(() => {
  vi.stubGlobal("useToast", () => ({
    add: (toast: Toast) => toasts.push(toast),
  }));
  vi.stubGlobal("useApiErrorPresenter", () => ({
    presentError: (error: unknown, options: { fallbackKey: string }) => {
      presented.push(error);
      fallbackKeys.push(options.fallbackKey);
    },
  }));
  route.path = "/books";
  isOwner.value = true;
  pushed.length = 0;
  posted.length = 0;
  toasts.length = 0;
  presented.length = 0;
  fallbackKeys.length = 0;
  answers = [];
});

describe("Edit as mockup header action", () => {
  it("sits at order 89, before Mockups and Branding, as the pencil labelled Edit as mockup (fails on an order clash)", () => {
    const { id, order, icon, label } = action();

    expect({ id, order, icon, label }).toEqual({
      id: "dms-edit-as-mockup",
      order: 89,
      icon: "i-ph-pencil-simple-line-light",
      label: "$editAsMockup.label",
    });
  });

  it("shows on a page of the dashboard and hides on the dev tool pages and on unknown paths (fails when it offers to convert /mockup itself)", () => {
    const { isVisible } = action();
    const visibleOn = (path: string) => {
      route.path = path;
      return isVisible?.();
    };

    expect(visibleOn("/books")).toBe(true);
    for (const path of [
      "/mockup",
      "/mockups",
      "/dms-preview",
      "/branding",
      "/nowhere",
    ]) {
      expect(visibleOn(path), path).toBe(false);
    }
  });

  it("hides from a viewer who is not the platform owner, whom the mockup API refuses (fails when a member is offered a conversion that answers 403)", () => {
    const { isVisible } = action();
    isOwner.value = false;

    expect(isVisible?.()).toBe(false);
  });

  it("posts the path on screen and opens the URL the backend answers (fails when the frontend builds its own URL or sends a ref)", async () => {
    answers = [
      {
        ok: true,
        outcome: "created",
        url: "/mockup?name=books&page=books&mode=edit",
      },
    ];

    action().onSelect?.();
    await flush();

    expect(posted).toEqual([{ url: "/api/mockup/from-page", path: "/books" }]);
    expect(pushed).toEqual(["/mockup?name=books&page=books&mode=edit"]);
    expect(toasts).toEqual([]);
  });

  it("opens a stale mockup and offers to convert it again with the digest it read (fails on a silent overwrite or a lost edit warning)", async () => {
    answers = [
      {
        ok: true,
        outcome: "reopened",
        stale: true,
        digest: "d1",
        url: "/mockup?name=books&page=books&mode=edit",
      },
      {
        ok: true,
        outcome: "replaced",
        url: "/mockup?name=books&page=books&mode=edit",
      },
    ];

    action().onSelect?.();
    await flush();
    route.path = "/mockup";
    toasts[0]?.actions?.[0]?.onClick?.();
    await flush();

    expect(toasts.map((toast) => toast.title)).toEqual(["editAsMockup.stale"]);
    expect(posted).toEqual([
      { url: "/api/mockup/from-page", path: "/books" },
      {
        url: "/api/mockup/from-page",
        path: "/books",
        replace: true,
        digest: "d1",
      },
    ]);
  });

  it("presents a refusal and opens nothing (fails when a failed conversion navigates)", async () => {
    answers = [new Error("404 not_found")];

    action().onSelect?.();
    await flush();

    expect(presented).toHaveLength(1);
    expect(pushed).toEqual([]);
    expect(fallbackKeys).toEqual(["editAsMockup.failed"]);
  });

  it("says the mockup changed while converting when the backend answers 409, on the plain error and on a response-wrapped one (fails when a conflict reads as could not be opened)", async () => {
    answers = [
      Object.assign(new Error("409 conflict"), { statusCode: 409 }),
      Object.assign(new Error("409 conflict"), { response: { status: 409 } }),
      Object.assign(new Error("422 invalid"), { statusCode: 422 }),
    ];

    const attempts = answers.length;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      action().onSelect?.();
      await flush();
    }

    expect(fallbackKeys).toEqual([
      "editAsMockup.conflict",
      "editAsMockup.conflict",
      "editAsMockup.failed",
    ]);
    expect(pushed).toEqual([]);
  });
});

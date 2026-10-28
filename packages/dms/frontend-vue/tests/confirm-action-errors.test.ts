/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
} from "vue";
import ConfirmModal from "../layers/dms-ui/app/components/confirm/ConfirmModal.vue";
import {
  ACTION_ERROR_FORBIDDEN_KEY,
  ACTION_ERROR_GENERIC_KEY,
  ACTION_ERROR_NETWORK_KEY,
  resolveActionError,
} from "../layers/dms-ui/app/build/composables/confirm/actionError";
import { ConfirmActionError } from "../layers/dms-ui/app/composables/confirm/types";

import { DialogRoot } from "reka-ui";

/** An ofetch `FetchError` as a refused (or unreachable) request throws it. */
function fetchError(status: number | undefined, data?: unknown) {
  return Object.assign(
    new Error(`[DELETE] "/api/task/delete": ${status ?? "<no response>"}`),
    { name: "FetchError", statusCode: status, data },
  );
}

const TRANSLATIONS: Record<string, string> = {
  "error.not_found": "Not found",
  "page.settings.invites.error.expired": "This invitation has expired",
};

const translate = (key: string) => TRANSLATIONS[key] ?? key;

describe("resolveActionError", () => {
  it("translates the server's i18n key, bare or `$`-marked", () => {
    expect(
      resolveActionError(fetchError(404, "error.not_found"), translate),
    ).toBe("Not found");
    expect(
      resolveActionError(
        fetchError(410, { message: "$page.settings.invites.error.expired" }),
        translate,
      ),
    ).toBe("This invitation has expired");
  });

  it("shows the plain text of a 4xx as it came", () => {
    expect(
      resolveActionError(fetchError(409, "Already archived"), translate),
    ).toBe("Already archived");
  });

  it("names the fields the data API refused by their labels", () => {
    const named = (key: string, params: Record<string, unknown>) =>
      key === "dms.field_errors.named_required"
        ? `${String(params.field)} is required.`
        : key;
    const refused = fetchError(400, {
      code: "missing_mandatory_fields",
      fields: ["due_date", "owner"],
    });
    expect(
      resolveActionError(refused, named, (field) =>
        field === "due_date" ? "Due date" : undefined,
      ),
    ).toBe("Due date is required. owner is required.");
  });

  it("words a refused permission for users, not the server's developer text", () => {
    expect(
      resolveActionError(
        fetchError(403, "Forbidden: missing permission settings.members.edit"),
        translate,
      ),
    ).toBe(ACTION_ERROR_FORBIDDEN_KEY);
    expect(resolveActionError(fetchError(401), translate)).toBe(
      ACTION_ERROR_FORBIDDEN_KEY,
    );
  });

  it("falls back on a generic message for a crash, JSON, a stack or an untranslated key", () => {
    for (const error of [
      fetchError(500, "Archive field not configured."),
      fetchError(422, '{"issues":[{"path":["name"]}]}'),
      fetchError(400, "TypeError: x is undefined\n    at run (a.js:1:2)"),
      fetchError(404, "error.no_such_key"),
      fetchError(400, { detail: "no message field" }),
      { unexpected: true },
    ]) {
      expect(resolveActionError(error, translate)).toBe(
        ACTION_ERROR_GENERIC_KEY,
      );
    }
  });

  it("tells a request that never reached the server apart", () => {
    expect(resolveActionError(fetchError(undefined), translate)).toBe(
      ACTION_ERROR_NETWORK_KEY,
    );
    expect(
      resolveActionError(new TypeError("Failed to fetch"), translate),
    ).toBe(ACTION_ERROR_NETWORK_KEY);
  });

  it("keeps a message a caller already worded for users", () => {
    expect(
      resolveActionError(new Error("Pick another role first."), translate),
    ).toBe("Pick another role first.");
  });
});

describe("ConfirmModal failures", () => {
  let app: App | undefined;
  let host: HTMLDivElement;
  const closed = vi.fn();

  const Slots = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h("div", [slots.header?.(), slots.body?.(), slots.footer?.()]),
  });

  const Button = defineComponent({
    props: { label: String, disabled: Boolean, loading: Boolean },
    emits: ["click"],
    setup:
      (props, { emit }) =>
      () =>
        h(
          "button",
          {
            disabled: props.disabled,
            "data-loading": props.loading || undefined,
            onClick: () => emit("click"),
          },
          props.label,
        ),
  });

  const Alert = defineComponent({
    props: { title: String, description: String, color: String },
    setup: (props) => () =>
      h("div", { "data-alert": props.color }, [
        h("strong", props.title),
        props.description ? h("p", props.description) : null,
      ]),
  });

  const Empty = defineComponent({ setup: () => () => null });

  async function flush(): Promise<void> {
    for (let tick = 0; tick < 6; tick++) await nextTick();
  }

  function mount(props: Record<string, unknown>): void {
    app = createApp({
      render: () =>
        h(DialogRoot, null, () =>
          h(ConfirmModal, { onClose: closed, ...props }),
        ),
    });
    app.config.globalProperties.$t = (key: string) => key;
    app.component("UModal", Slots);
    app.component("UButton", Button);
    app.component("UAlert", Alert);
    for (const name of ["UIcon", "UKbd", "UFormField", "UInput", "I18nT"]) {
      app.component(name, Empty);
    }
    app.component("DmsIconWell", Empty);
    app.mount(host);
  }

  const button = (label: string) =>
    [...host.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === label,
    );
  const alert = () => host.querySelector<HTMLElement>("[data-alert]");

  beforeEach(() => {
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useTranslation", () => ({
      processApiMessage: (message: string) => message,
    }));
    vi.stubGlobal("resolveDmsComponent", () => undefined);
    host = document.createElement("div");
    document.body.append(host);
    closed.mockReset();
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    host.remove();
    vi.unstubAllGlobals();
  });

  it("stays open on a refusal, shows why, and lets the user retry", async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(
        fetchError(403, "Forbidden: missing permission tasks.delete"),
      )
      .mockResolvedValueOnce(undefined);
    mount({
      title: "Delete?",
      description: "Gone",
      confirmLabel: "Delete",
      onConfirm,
    });
    await flush();

    button("Delete")!.click();
    await flush();
    expect(closed).not.toHaveBeenCalled();
    expect(alert()?.dataset.alert).toBe("error");
    expect(alert()?.textContent).toBe(ACTION_ERROR_FORBIDDEN_KEY);

    expect(host.textContent).not.toContain("[DELETE]");

    expect(button("Delete")!.dataset.loading).toBeUndefined();
    expect(button("Delete")!.disabled).toBe(false);
    expect(button("dms.confirm.cancel")!.disabled).toBe(false);

    button("Delete")!.click();
    await flush();
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(closed).toHaveBeenCalledWith(true);
  });

  it("names one button Cancel: the corner one closes", async () => {
    mount({ title: "Delete?", description: "Gone", confirmLabel: "Delete" });
    await flush();
    const named = (label: string) =>
      [...host.querySelectorAll("button")].filter(
        (candidate) =>
          (candidate.getAttribute("aria-label") ?? candidate.textContent) ===
          label,
      );
    expect(named("dms.confirm.cancel")).toHaveLength(1);
    expect(named("dms.confirm.close")).toHaveLength(1);
  });

  it("clears the error when the user retries", async () => {
    let settle: (value?: unknown) => void = () => undefined;
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(fetchError(undefined))
      .mockImplementationOnce(
        () => new Promise((resolve) => (settle = resolve)),
      );
    mount({
      title: "Archive?",
      description: "",
      confirmLabel: "Archive",
      onConfirm,
    });
    await flush();

    button("Archive")!.click();
    await flush();
    expect(alert()?.textContent).toBe(ACTION_ERROR_NETWORK_KEY);

    button("Archive")!.click();
    await flush();
    expect(alert()).toBeNull();
    expect(button("Archive")!.dataset.loading).toBe("true");
    settle();
    await flush();
    expect(closed).toHaveBeenCalledWith(true);
  });

  it("cancelling after a failure resolves false", async () => {
    const onConfirm = vi.fn().mockRejectedValue(fetchError(500));
    mount({
      title: "Delete?",
      description: "",
      confirmLabel: "Delete",
      onConfirm,
    });
    await flush();
    button("Delete")!.click();
    await flush();
    button("dms.confirm.cancel")!.click();
    expect(closed).toHaveBeenCalledWith(false);
  });

  it("shows a message already worded by the action, with its reason", async () => {
    const onConfirm = vi.fn().mockRejectedValue(
      new ConfirmActionError({
        title: "These 2 items couldn’t be deleted.",
        description: "Their rules don’t allow this action.",
      }),
    );
    mount({
      title: "Delete?",
      description: "",
      confirmLabel: "Delete",
      onConfirm,
    });
    await flush();
    button("Delete")!.click();
    await flush();
    expect(alert()?.querySelector("strong")?.textContent).toBe(
      "These 2 items couldn’t be deleted.",
    );
    expect(alert()?.querySelector("p")?.textContent).toBe(
      "Their rules don’t allow this action.",
    );
  });

  it("sums up a partial outcome, then only acknowledges it", async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      partial: {
        title: "2 of 5 items couldn’t be archived.",
        description: "Their rules don’t allow this action.",
      },
    });
    mount({
      title: "Archive?",
      description: "",
      confirmLabel: "Archive",
      onConfirm,
    });
    await flush();
    button("Archive")!.click();
    await flush();

    expect(closed).not.toHaveBeenCalled();
    expect(alert()?.dataset.alert).toBe("warning");
    expect(alert()?.querySelector("strong")?.textContent).toBe(
      "2 of 5 items couldn’t be archived.",
    );

    expect(button("Archive")).toBeUndefined();
    button("dms.confirm.close")!.click();
    expect(closed).toHaveBeenCalledWith(true);
  });
});

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
  ACTION_ERROR_GENERIC_KEY,
  resolveActionError,
} from "../layers/dms-ui/app/entries/composables/confirm/actionError";
import { ConfirmActionError } from "../layers/dms-ui/app/composables/confirm/types";

import { DialogRoot } from "reka-ui";
import {
  readOnlyFailure,
  installReadOnlyRefusal,
} from "./helpers/read-only-refusal";

/** An ofetch `FetchError` as a refused (or unreachable) request throws it. */
function fetchError<Data = undefined>(status: number | undefined, data?: Data) {
  return Object.assign(
    new Error(`[DELETE] "/api/task/delete": ${status ?? "<no response>"}`),
    { name: "FetchError", statusCode: status, data },
  );
}

describe("resolveActionError", () => {
  it("forwards loaded keys without using the legacy translator as a lookup", () => {
    const translate = vi.fn(() => "Untrusted missing-handler text");
    for (const message of ["error.read_only_demo", "$error.read_only_demo"]) {
      expect(resolveActionError(fetchError(403, { message }), translate)).toBe(
        "error.read_only_demo",
      );
    }
    expect(translate).not.toHaveBeenCalled();
  });

  it("uses the presenter fallback for untrusted text and unknown keys", () => {
    for (const error of [
      fetchError(500, "Archive field not configured."),
      fetchError(422, '{"issues":[{"path":["name"]}]}'),
      fetchError(400, "TypeError: x is undefined\n    at run (a.js:1:2)"),
      fetchError(404, "error.no_such_key"),
      fetchError(400, { detail: "no message field" }),
      new Error("Pick another role first."),
      new TypeError("Failed to fetch"),
      { unexpected: true },
    ]) {
      expect(resolveActionError(error, (key) => key)).toBe(
        ACTION_ERROR_GENERIC_KEY,
      );
    }
  });

  it("returns no text for cancellation", () => {
    expect(
      resolveActionError(
        new DOMException("Aborted", "AbortError"),
        (key) => key,
      ),
    ).toBe("");
  });
});

describe("ConfirmModal failures", () => {
  const fixture = createConfirmActionErrorsFixture();
  registerConfirmationRetryTests(fixture);
  registerConfirmationOutcomeTests(fixture);
});

function createConfirmActionErrorsFixture() {
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

  function mount(
    props: Partial<InstanceType<typeof ConfirmModal>["$props"]>,
  ): void {
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
  return {
    mount,
    flush,
    button,
    closed,
    alert,
    get host() {
      return host;
    },
  };
}

function registerConfirmationRetryTests(
  fixture: ReturnType<typeof createConfirmActionErrorsFixture>,
) {
  it("keeps a refusal inline and clears pending for retry without a toast", async () => {
    const add = vi.fn();
    vi.stubGlobal("useToast", () => ({ add }));
    installReadOnlyRefusal();
    fixture.mount({
      title: "Delete?",
      confirmLabel: "Delete",
      onConfirm: vi.fn().mockRejectedValue(readOnlyFailure()),
    });
    await fixture.flush();
    fixture.button("Delete")!.click();
    await fixture.flush();
    expect(fixture.closed).not.toHaveBeenCalled();
    expect(fixture.alert()?.textContent).toContain("error.read_only_demo");
    expect(fixture.button("Delete")!.disabled).toBe(false);
    expect(fixture.button("Delete")!.dataset.loading).toBeUndefined();
    expect(add).not.toHaveBeenCalled();
  });

  it("stays open on a refusal, shows why, and lets the user retry", async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(
        fetchError(403, "Forbidden: missing permission tasks.delete"),
      )
      .mockResolvedValueOnce(undefined);
    fixture.mount({
      title: "Delete?",
      description: "Gone",
      confirmLabel: "Delete",
      onConfirm,
    });
    await fixture.flush();

    fixture.button("Delete")!.click();
    await fixture.flush();
    expect(fixture.closed).not.toHaveBeenCalled();
    expect(fixture.alert()?.dataset.alert).toBe("warning");
    expect(fixture.alert()?.textContent).toBe(ACTION_ERROR_GENERIC_KEY);

    expect(fixture.host.textContent).not.toContain("[DELETE]");

    expect(fixture.button("Delete")!.dataset.loading).toBeUndefined();
    expect(fixture.button("Delete")!.disabled).toBe(false);
    expect(fixture.button("dms.confirm.cancel")!.disabled).toBe(false);

    fixture.button("Delete")!.click();
    await fixture.flush();
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(fixture.closed).toHaveBeenCalledWith(true);
  });

  it("names one button Cancel: the corner one closes", async () => {
    fixture.mount({
      title: "Delete?",
      description: "Gone",
      confirmLabel: "Delete",
    });
    await fixture.flush();
    const named = (label: string) =>
      [...fixture.host.querySelectorAll("button")].filter(
        (candidate) =>
          (candidate.getAttribute("aria-label") ?? candidate.textContent) ===
          label,
      );
    expect(named("dms.confirm.cancel")).toHaveLength(1);
    expect(named("dms.confirm.close")).toHaveLength(1);
  });

  it("clears the error when the user retries", async () => {
    let settle: () => void = () => undefined;
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(fetchError(undefined))
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => (settle = resolve)),
      );
    fixture.mount({
      title: "Archive?",
      description: "",
      confirmLabel: "Archive",
      onConfirm,
    });
    await fixture.flush();

    fixture.button("Archive")!.click();
    await fixture.flush();
    expect(fixture.alert()?.textContent).toBe(ACTION_ERROR_GENERIC_KEY);

    fixture.button("Archive")!.click();
    await fixture.flush();
    expect(fixture.alert()).toBeNull();
    expect(fixture.button("Archive")!.dataset.loading).toBe("true");
    settle();
    await fixture.flush();
    expect(fixture.closed).toHaveBeenCalledWith(true);
  });

  it("cancelling after a failure resolves false", async () => {
    const onConfirm = vi.fn().mockRejectedValue(fetchError(500));
    fixture.mount({
      title: "Delete?",
      description: "",
      confirmLabel: "Delete",
      onConfirm,
    });
    await fixture.flush();
    fixture.button("Delete")!.click();
    await fixture.flush();
    fixture.button("dms.confirm.cancel")!.click();
    expect(fixture.closed).toHaveBeenCalledWith(false);
  });
}

function registerConfirmationOutcomeTests(
  fixture: ReturnType<typeof createConfirmActionErrorsFixture>,
) {
  it.each([
    ["unknown.server.key", "These 2 items could not be deleted."],
    ["error.read_only_demo", "error.read_only_demo"],
  ])(
    "resolves an action wrapping %s with its fallback and placeholders",
    async (message, expected) => {
      installReadOnlyRefusal().mergeLocaleMessage("en", {
        action: { refused: "These {count} items could not be deleted." },
      });
      const onConfirm = vi
        .fn()
        .mockRejectedValue(
          new ConfirmActionError(
            { fallbackKey: "action.refused", params: { count: 2 } },
            { cause: { ...readOnlyFailure(), data: { message } } },
          ),
        );
      fixture.mount({
        title: "Delete?",
        description: "",
        confirmLabel: "Delete",
        onConfirm,
      });
      await fixture.flush();
      fixture.button("Delete")!.click();
      await fixture.flush();
      expect(fixture.alert()?.querySelector("strong")?.textContent).toBe(
        expected,
      );
      expect(fixture.alert()?.querySelector("p")).toBeNull();
    },
  );

  it("sums up a partial outcome, then only acknowledges it", async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      partial: {
        title: "2 of 5 items couldn’t be archived.",
        description: "Their rules don’t allow this action.",
      },
    });
    fixture.mount({
      title: "Archive?",
      description: "",
      confirmLabel: "Archive",
      onConfirm,
    });
    await fixture.flush();
    fixture.button("Archive")!.click();
    await fixture.flush();

    expect(fixture.closed).not.toHaveBeenCalled();
    expect(fixture.alert()?.dataset.alert).toBe("warning");
    expect(fixture.alert()?.querySelector("strong")?.textContent).toBe(
      "2 of 5 items couldn’t be archived.",
    );

    expect(fixture.button("Archive")).toBeUndefined();
    fixture.button("dms.confirm.close")!.click();
    expect(fixture.closed).toHaveBeenCalledWith(true);
  });
}

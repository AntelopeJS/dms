/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type App,
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
} from "vue";
import { createI18n } from "vue-i18n";
import ConfirmModal from "../layers/dms-ui/app/components/confirm/ConfirmModal.vue";
import { resolveConfirmDialog } from "../layers/dms-ui/app/entries/composables/confirm/confirmDialogTexts";
import { secondaryTargetRunner } from "../layers/dms-ui/app/entries/composables/confirm/secondaryTarget";
import { downloadFilename } from "../layers/dms-ui/app/entries/utils/fileDownload";

import { DialogRoot } from "reka-ui";

const i18n = createI18n({
  legacy: false,
  locale: "en",
  messages: { en: { lang: { download: "Download {file}" } } },
});
const t = i18n.global.t;

describe("a confirmation's secondary action, resolved", () => {
  it("fills its label, URL and file name with the row and the params", async () => {
    const runTarget = vi.fn();
    const options = resolveConfirmDialog(
      {
        title: "Remove {name}?",
        params: { file: "fr.json" },
        secondaryAction: {
          label: "$lang.download",
          icon: "i-ph-download-simple",
          target: {
            type: "download",
            url: "/legacy/lang/{{row.workspace}}/{{row.code}}.json",
            filename: "{{row.workspace}}-{{row.file}}",
          },
        },
      },
      { name: "French", code: "fr", workspace: "site" },
      t,
      runTarget,
    );
    expect(options.secondaryAction).toMatchObject({
      label: "Download fr.json",
      icon: "i-ph-download-simple",
    });
    await options.secondaryAction!.run();
    expect(runTarget).toHaveBeenCalledWith({
      type: "download",
      url: "/legacy/lang/site/fr.json",
      filename: "site-fr.json",
    });
  });

  it("is left out when nothing can run it", () => {
    const options = resolveConfirmDialog(
      {
        title: "Remove?",
        secondaryAction: {
          label: "Docs",
          target: { type: "external", url: "https://antelopejs.com" },
        },
      },
      undefined,
      t,
    );
    expect(options.secondaryAction).toBeUndefined();
  });
});

describe("a confirmation's secondary target", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("names a download as declared, else as served, else after its URL", () => {
    const target = {
      type: "download" as const,
      url: "/files/fr%20FR.json?v=2",
    };
    expect(downloadFilename({ ...target, filename: "a.json" }, null)).toBe(
      "a.json",
    );
    expect(downloadFilename(target, 'attachment; filename="served.json"')).toBe(
      "served.json",
    );
    expect(downloadFilename(target, null)).toBe("fr FR.json");
  });

  it("fetches a download with the session and saves it", async () => {
    const blob = new Blob(["{}"]);
    const fetchRaw = vi.fn(async () => ({
      _data: blob,
      headers: new Headers(),
    }));
    const createObjectURL = vi.fn(() => "blob:fr");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL }),
    );
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(`${this.href} ${this.download}`);
    });

    await secondaryTargetRunner(fetchRaw)({
      type: "download",
      url: "/legacy/lang/fr.json",
    });

    expect(fetchRaw).toHaveBeenCalledWith("/legacy/lang/fr.json", {
      responseType: "blob",
    });
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(saved).toEqual(["blob:fr fr.json"]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fr");
  });

  it("opens a link in a new tab when asked", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const fetchRaw = vi.fn();
    await secondaryTargetRunner(fetchRaw)({
      type: "external",
      url: "https://antelopejs.com",
      newTab: true,
    });
    expect(open).toHaveBeenCalledWith(
      "https://antelopejs.com",
      "_blank",
      "noopener,noreferrer",
    );
    expect(fetchRaw).not.toHaveBeenCalled();
  });
});

describe("ConfirmModal secondary action", () => {
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
    props: { label: String },
    emits: ["click"],
    setup:
      (props, { emit }) =>
      () =>
        h("button", { onClick: () => emit("click") }, props.label),
  });
  const Alert = defineComponent({
    props: { title: String },
    setup: (props) => () => h("p", { "data-alert": "" }, props.title),
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
    for (const name of ["UIcon", "UKbd", "UInput", "UFormField", "I18nT"]) {
      app.component(name, Empty);
    }
    app.component("DmsIconWell", Empty);
    app.mount(host);
  }

  const button = (label: string) =>
    [...host.querySelectorAll("button")].find(
      (entry) => entry.textContent === label,
    );

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

  it("draws no third button without one", async () => {
    mount({ title: "Remove French?" });
    await flush();
    expect(host.querySelectorAll("button")).toHaveLength(3);
  });

  it("runs it and stays open, the action still to confirm", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    mount({
      title: "Remove French?",
      secondaryAction: { label: "Download fr.json", run },
      onConfirm,
    });
    await flush();

    button("Download fr.json")!.click();
    await flush();

    expect(run).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();

    button("dms.confirm.confirm")!.click();
    await flush();
    expect(closed).toHaveBeenCalledWith(true);
  });

  it("shows a failure in the dialog's alert, the dialog open", async () => {
    const run = vi.fn().mockRejectedValue(new Error("offline"));
    mount({
      title: "Remove French?",
      secondaryAction: { label: "Download fr.json", run },
    });
    await flush();

    button("Download fr.json")!.click();
    await flush();

    expect(host.querySelector("[data-alert]")).not.toBeNull();
    expect(closed).not.toHaveBeenCalled();
  });
});

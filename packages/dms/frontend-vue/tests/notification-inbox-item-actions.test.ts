/** @vitest-environment jsdom */
import {
  computed,
  createApp,
  defineComponent,
  h,
  ref,
  type App,
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotificationInboxItem from "../layers/dms-layout/app/build/components/pages/settings/notification/NotificationInboxItem.vue";

interface ButtonUi {
  label?: string;
}

let app: App | undefined;
const buttons: { label?: string; ui?: ButtonUi; emit: () => void }[] = [];

function mount(
  component: Component,
  props: {
    notification: Pick<
      InstanceType<typeof NotificationInboxItem>["$props"]["notification"],
      "_id" | "title" | "isRead" | "createdAt"
    >;
    time: string;
  },
) {
  app = createApp(defineComponent({ setup: () => () => h(component, props) }));
  app.component(
    "UButton",
    defineComponent({
      props: {
        label: String,
        ui: Object,
      },
      emits: ["click"],
      setup: (props, { emit }) => {
        buttons.push({
          label: props.label,
          ui: props.ui,
          emit: () => emit("click"),
        });
        return () => h("button", props.label);
      },
    }),
  );
  app.component(
    "DmsListRow",
    defineComponent({
      setup:
        (_props, { slots }) =>
        () =>
          h("article", [slots.default?.(), slots.trailing?.()]),
    }),
  );
  app.mount(document.createElement("div"));
}

beforeEach(() => {
  buttons.length = 0;
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en-GB"),
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("notification inbox row actions", () => {
  it("keeps the labels laid out on hover, so no button moves under the pointer", () => {
    mount(NotificationInboxItem, {
      notification: {
        _id: "n1",
        title: "Deploy",
        isRead: false,
        createdAt: "",
      },
      time: "now",
    });
    expect(buttons.map((button) => button.label)).toEqual([
      "page.settings.notifications.mark_read",
      "page.settings.notifications.delete",
    ]);
    for (const { ui } of buttons) {
      const classes = (ui?.label ?? "").split(/\s+/);
      expect(classes).toContain("sm:inline");

      const revealed = classes.filter((name) =>
        /group-(hover|focus-within):/.test(name),
      );
      expect(revealed.length).toBeGreaterThan(0);
      for (const name of revealed) expect(name).toMatch(/:opacity-/);
    }
  });
});

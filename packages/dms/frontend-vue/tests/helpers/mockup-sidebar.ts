import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useSlots,
  watch,
  type App,
  type Ref,
  type Slots,
  type VNodeArrayChildren,
  type VNodeChild,
} from "vue";
import type { NavigationMenuItem } from "@nuxt/ui";
import { vi } from "vitest";
import { MENU_STATUS_TEXT_CLASSES } from "#dms-core/app/utils/menu";
import { isString } from "#dms-core/app/utils/type-check";
import NavigationMenu from "../../layers/dms-layout/app/components/navigation/NavigationMenu.vue";
import type { PreviewNavigation } from "../../layers/dms-ui/app/entries/utils/blockPreview";
import { stubDmsState } from "./dms-state-stub";
import { UButton, UDropdownMenu, UIcon, UInput } from "./mockup-runtime";

const SALES = { id: "sales", title: "Sales", icon: "i-ph-storefront" };
const CRM = { id: "crm", title: "Customers" };

/** A mockup's sidebar: Home in the default section, Orders under Sales, and the empty Customers. */
export function shopNavigation(editable: boolean): PreviewNavigation {
  return {
    title: "Shop",
    sections: [
      { items: [{ id: "home", label: "Home", icon: "i-ph-house-light" }] },
      {
        category: SALES,
        items: [{ id: "orders", label: "Orders", icon: "i-ph-cart" }],
      },
      { category: CRM, items: [] },
    ],
    active: "orders",
    ...(editable && { editable: true }),
  };
}

const parentWindow = {
  postMessage: vi.fn<(message: { type: string }) => void>(),
};

export function posted(type: string): unknown[] {
  return parentWindow.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === type);
}

/** Stubs what the sidebar's menu reads, and the embedding page its messages go to. */
export function stubMenuRuntime(): void {
  Object.entries({
    computed,
    ref,
    watch,
    useSlots,
    onMounted,
    onBeforeUnmount,
  }).forEach(([key, value]) => vi.stubGlobal(key, value));
  stubDmsState(new Map<string, Ref<unknown>>());
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en"),
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  vi.stubGlobal("MENU_STATUS_TEXT_CLASSES", MENU_STATUS_TEXT_CLASSES);
  Object.defineProperty(window, "parent", {
    value: parentWindow,
    configurable: true,
  });
  parentWindow.postMessage.mockClear();
}

export async function flush(): Promise<void> {
  await nextTick();
  await nextTick();
}

const NO_CLASS = () => "";

/** What Nuxt UI's menu hands an entry's slots. */
interface ItemScope {
  item: NavigationMenuItem;
  active: boolean;
  ui: { linkLeadingIcon: typeof NO_CLASS; linkLabel: typeof NO_CLASS };
}

function itemSlot(
  slots: Slots,
  item: NavigationMenuItem,
  part: string,
): ((scope: ItemScope) => VNodeChild) | undefined {
  return item.slot ? slots[`${item.slot}${part}`] : undefined;
}

function textAttribute(
  item: NavigationMenuItem,
  name: string,
): string | undefined {
  const value: unknown = item[name];
  return isString(value) ? value : undefined;
}

/**
 * Stands in for Nuxt UI's menu with its slot contract: an entry naming a
 * `slot` is drawn by that slot, else by its `-label` and `-trailing` slots
 * around its label; a link is a button whose click selects it.
 */
const UNavigationMenu = defineComponent({
  props: { items: { type: Array, required: true } },
  setup(props: { items: NavigationMenuItem[][] }) {
    const slots = useSlots();
    function content(item: NavigationMenuItem): VNodeArrayChildren {
      const scope: ItemScope = {
        item,
        active: item.active === true,
        ui: { linkLeadingIcon: NO_CLASS, linkLabel: NO_CLASS },
      };
      const whole = itemSlot(slots, item, "");
      if (whole) return [whole(scope)];
      return [
        itemSlot(slots, item, "-label")?.(scope) ?? item.label,
        itemSlot(slots, item, "-trailing")?.(scope),
      ];
    }
    return () =>
      h(
        "nav",
        props.items.map((group) =>
          h(
            "ul",
            group.map((item) =>
              h(
                "li",
                item.type === "label"
                  ? h("div", { class: item.class }, content(item))
                  : h(
                      "button",
                      {
                        type: "button",
                        class: item.class,
                        disabled: item.disabled,
                        "data-to": item.to,
                        "aria-current": textAttribute(item, "aria-current"),
                        "data-dms-preview-page": textAttribute(
                          item,
                          "data-dms-preview-page",
                        ),
                        onClick: () => item.onSelect?.(new Event("select")),
                      },
                      content(item),
                    ),
              ),
            ),
          ),
        ),
      );
  },
});

/** Registers the dashboard's menu over the stand-ins for Nuxt UI. */
export function registerMenu(target: App): void {
  target.component("DmsNavigationMenu", NavigationMenu);
  target.component("UNavigationMenu", UNavigationMenu);
  target.component("UButton", UButton);
  target.component("UInput", UInput);
  target.component("UIcon", UIcon);
  target.component("UDropdownMenu", UDropdownMenu);
}

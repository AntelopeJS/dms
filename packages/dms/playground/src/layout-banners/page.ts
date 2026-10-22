import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { KeyValueList } from "@antelopejs/interface-dms/base";
import {
  DefaultLayout,
  type PageHeaderButton,
} from "@antelopejs/interface-dms/base/layouts";
import { chromeSection } from "../sections";
import { LAYOUT_BANNERS_API } from "./api";
import { BANNER_KEYS, type BannerKey } from "./banners";

const BUTTON_LABELS: Record<BannerKey, string> = {
  info: "Toggle the text banner",
  "past-due": "Toggle the resolved banner",
  component: "Toggle the component banner",
};

function toggleButton(key: BannerKey): PageHeaderButton {
  return {
    id: `toggle-${key}`,
    label: BUTTON_LABELS[key],
    icon: "i-ph-flag-banner",
    target: {
      type: "api",
      method: "POST",
      url: `${LAYOUT_BANNERS_API}/${key}/toggle`,
      successMessage: "Banner toggled",
    },
  };
}

@RegisterPage()
export class LayoutBannersPage extends PageController(
  "layout-banners",
  {
    displayName: "Layout banners",
    icon: "i-ph-flag-banner",
    category: chromeSection,
    order: 10,
    description:
      "Demonstrates: RegisterLayoutBanner as a text, a resolved and a component banner, refreshed with NotifyMenuChanged. Toggle them from the header: the text banner shows on the application's pages, the past-due and suspended ones everywhere, module pages included.",
  },
  DefaultLayout({ headerActions: BANNER_KEYS.map(toggleButton) }),
) {
  static status = KeyValueList({
    title: "Banners of this workspace",
    fetchUrl: `${LAYOUT_BANNERS_API}/status`,
  });

  static options = KeyValueList({
    title: "What each banner shows",
    items: [
      {
        label: "Text banner",
        value: "text, actions, dismissible, visible",
        detail: "Close it: the dismissal lasts for the browser session.",
      },
      {
        label: "Resolved banner",
        value: "resolve → { text: ComposedText, actions }",
        detail:
          "The amount and the date are sent raw and written in your language and time zone.",
      },
      {
        label: "Component banner",
        value: "component, props, isTenantAccessDenied",
        detail:
          "Mounts PlaygroundSuspendedBanner; also shows while the Tenancy page suspends the workspace.",
      },
      {
        label: "Scope",
        value: "scope: app (default), everywhere",
        detail:
          "Open a module page: the text banner stays out of the module area, the workspace-wide ones follow you in.",
      },
      {
        label: "Stack order",
        value: "order 0, 10, 20",
        detail: "Banners stack by order under the dashboard header.",
      },
    ],
  });
}

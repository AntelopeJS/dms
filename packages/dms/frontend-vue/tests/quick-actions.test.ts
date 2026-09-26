import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchQuickActionTarget } from "../layers/dms-layout/app/composables/page/useQuickActions";
import {
  QUICK_ACTION_ADD,
  QUICK_ACTION_BUTTON,
  QUICK_ACTION_BUTTON_KEY,
  QUICK_ACTION_COMPONENT_KEY,
  QUICK_ACTION_QUERY_KEY,
} from "../layers/dms-ui/app/types/quick-actions";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dispatchQuickActionTarget", () => {
  it("routes open-form actions to the target table", () => {
    const navigateDms = vi.fn();
    vi.stubGlobal("navigateDms", navigateDms);

    dispatchQuickActionTarget({
      type: "openForm",
      to: "/members",
      component: "members-table",
    });

    expect(navigateDms).toHaveBeenCalledWith({
      path: "/members",
      query: {
        [QUICK_ACTION_QUERY_KEY]: QUICK_ACTION_ADD,
        [QUICK_ACTION_COMPONENT_KEY]: "members-table",
      },
    });
  });

  it("routes button actions to the target table with the button to press", () => {
    const navigateDms = vi.fn();
    vi.stubGlobal("navigateDms", navigateDms);

    dispatchQuickActionTarget({
      type: "button",
      to: "/settings/user/members",
      component: "table",
      button: "invite",
    });

    expect(navigateDms).toHaveBeenCalledWith({
      path: "/settings/user/members",
      query: {
        [QUICK_ACTION_QUERY_KEY]: QUICK_ACTION_BUTTON,
        [QUICK_ACTION_COMPONENT_KEY]: "table",
        [QUICK_ACTION_BUTTON_KEY]: "invite",
      },
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchQuickActionTarget } from "../layers/dms-layout/app/composables/page/useQuickActions";
import {
  QUICK_ACTION_ADD,
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
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createI18n } from "vue-i18n";
import { Color } from "../layers/dms-core/app/types/color";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import { normalizeActionConfig } from "../layers/dms-core/app/utils/row-action-rule-evaluator";
import { interpolateUrl } from "../layers/dms-core/app/utils/url-interpolation";
import { useTranslation } from "../layers/dms-core/app/composables/translation/useTranslation";
import { useEventedAction } from "../layers/dms-core/app/composables/useEventedAction";
import core from "../layers/dms-core/i18n/locales/core-en-GB.json";
import ui from "../layers/dms-ui/i18n/locales/ui-en-GB.json";
import layout from "../layers/dms-layout/i18n/locales/layout-en-GB.json";

vi.mock("../layers/dms-ui/app/components/form/Form.vue", () => ({
  default: { name: "DmsForm" },
}));

type Messages = Record<string, unknown>;
const merge = (target: Messages, source: Messages): Messages => {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    target[key] =
      current && typeof current === "object" && typeof value === "object"
        ? merge({ ...(current as Messages) }, value as Messages)
        : value;
  }
  return target;
};

const i18n = createI18n({
  legacy: false,
  locale: "en",
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: merge(merge(merge({}, core), ui), layout) as never },
});
const t = i18n.global.t as (...args: unknown[]) => string;

const INVITE = { _id: "invite-1", email: "zz-invitee@example.com" };
const INVITES_PAGE = "/settings/workspace/members/invites";

const modal = { close: vi.fn() };
const openModal = vi.fn(() => modal);
const navigateDms = vi.fn();
const refresh = vi.fn();

/**
 * The row actions of the invitations table, configured as the server
 * serializes it: the edit form opens in a medium modal under the
 * "Edit invitation" texts, and no form page URL is handed down.
 */
async function invitesRowActions() {
  const { useTableRowActions } = await import(
    "../layers/dms-ui/app/build/composables/table-view/useTableViewRowActions"
  );
  return useTableRowActions({
    api: vi.fn() as never,
    location: "/api/tables/admin-invites",
    componentId: "table",
    pageId: "settings.workspace.members.invites",
    labelKey: "email",
    formContainer: {
      type: "modal",
      size: "md",
      pages: {
        edit: {
          displayName: "$page.settings.invites.form.edit_title",
          description: "$page.settings.invites.form.edit_description",
        },
      },
    } as never,
    formComponents: {
      edit: {
        componentName: "DmsForm",
        options: {
          fields: [],
          fetchUrl: "/api/tables/admin-invites/get?id={{params.id}}",
          submitUrl: "/api/tables/admin-invites/edit?id={{params.id}}",
        },
      } as never,
    },
    refreshCallback: refresh,
  });
}

beforeEach(() => {
  const globals: Record<string, unknown> = {
    ref,
    Color,
    HttpMethod,
    normalizeActionConfig,
    interpolateUrl,
    useTranslation,
    useEventedAction,
    useI18n: () => ({ t, locale: ref("en") }),
    useToast: () => ({ add: vi.fn() }),
    useConfirm: () => ({ confirm: vi.fn() }),
    useAuthFetch: () => ({ $authFetch: vi.fn() }),
    useModal: () => ({ open: openModal }),
    useDrawer: () => ({ open: vi.fn() }),
    useDmsRoute: () => ({ query: {}, path: INVITES_PAGE }),
    useExportJob: () => ({ runJob: vi.fn() }),
    useComponentEvent: () => ({ sendComponentEvent: vi.fn() }),
    navigateDms,
    resolveDmsComponent: vi.fn(),
  };
  for (const [name, value] of Object.entries(globals)) {
    vi.stubGlobal(name, value);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Invitations table: Edit invitation", () => {
  it("opens the form in a modal over the list, not on a page", async () => {
    const { editRow } = await invitesRowActions();
    await editRow(INVITE);

    expect(navigateDms).not.toHaveBeenCalled();
    expect(openModal).toHaveBeenCalledTimes(1);
    const [opened] = openModal.mock.calls[0] as unknown as [
      {
        title: string;
        description: string;
        size: string;
        componentOptions: Record<string, unknown>;
      },
    ];
    expect(opened.title).toBe("Edit invitation · zz-invitee@example.com");
    expect(opened.description).toBe(
      "The name, roles and language the invitee gets on accepting.",
    );
    expect(opened.size).toBe("md");
    expect(opened.componentOptions.fetchUrl).toBe(
      "/api/tables/admin-invites/get?id=invite-1",
    );
    expect(opened.componentOptions.submitUrl).toBe(
      "/api/tables/admin-invites/edit?id=invite-1",
    );
  });

  it("closes the modal and refreshes the list once saved", async () => {
    const { editRow } = await invitesRowActions();
    await editRow(INVITE);

    const [opened] = openModal.mock.calls[0] as unknown as [
      { componentOptions: { onSuccessCallback: () => void } },
    ];
    opened.componentOptions.onSuccessCallback();

    expect(modal.close).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

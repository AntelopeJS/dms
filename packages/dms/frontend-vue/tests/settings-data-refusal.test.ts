/** @vitest-environment jsdom */
import { createApp, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAccountData } from "../layers/dms-layout/app/entries/composables/settings/profile/useAccountData";
import { useModuleStore } from "../layers/dms-layout/app/composables/page/useModuleStore";
import { useModuleStoreActions } from "../layers/dms-layout/app/composables/page/useModuleStoreActions";
import { ConfirmActionError } from "../layers/dms-ui/app/composables/confirm";
import { useReadOnlyRefusal } from "../layers/dms-core/app/composables/useReadOnlyRefusal";
import { browserRuntime, stubApiData } from "./helpers/api-data-runtime";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";
import { storeEntry } from "./helpers/module-store-catalog-fixtures";
import {
  readOnlyFailure,
  unmarkedForbiddenFailure,
} from "./helpers/read-only-refusal";

const authFetch = vi.fn();
const add = vi.fn();
const app = createApp({});
browserRuntime(app);

beforeEach(() => {
  installAuthSettingsRuntime();
  stubApiData(authFetch);
  vi.stubGlobal("useToast", () => ({ add }));
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    te: () => false,
    locale: ref("en"),
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string) => key,
    processApiMessage: (key: string) => key,
  }));
  vi.stubGlobal("getAppTranslation", () => ({
    processApiMessage: (key: string) => key,
  }));
  vi.stubGlobal("useReadOnlyRefusal", useReadOnlyRefusal);
  vi.stubGlobal("useIsOwner", () => ref(false));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it.each([true, false])(
  "clears account-data pending state and keeps only the owning notice, marked %s",
  async (marked) => {
    const account = app.runWithContext(useAccountData);
    const consume = app.runWithContext(useReadOnlyRefusal);
    for (const action of [account.exportData, account.deleteAccount]) {
      add.mockClear();
      const failure = marked
        ? readOnlyFailure()
        : { response: new Response(null, { status: 403 }) };
      authFetch.mockImplementationOnce(async () => {
        consume(failure);
        throw failure;
      });
      await action();
      expect(account.isExporting.value).toBe(false);
      expect(account.isCheckingDeletion.value).toBe(false);
      expect(add).toHaveBeenCalledOnce();
      expect(add.mock.calls[0]?.[0].color).toBe(marked ? "warning" : "error");
    }
  },
);

it.each([true, false])(
  "keeps module-store direct failures to one notice, marked %s",
  async (marked) => {
    const consume = app.runWithContext(useReadOnlyRefusal);
    const store = app.runWithContext(useModuleStore);
    const entry = storeEntry("database");
    const actions = app.runWithContext(() =>
      useModuleStoreActions(store, ref([entry])),
    );
    const failure = marked
      ? readOnlyFailure()
      : {
          response: new Response(null, { status: 403 }),
          data: "error.forbidden",
        };
    vi.spyOn(store, "run").mockImplementation(async () => {
      consume(failure);
      throw failure;
    });
    await actions.runStoreAction("enable", entry);
    expect(add).toHaveBeenCalledOnce();
    expect(add.mock.calls[0]?.[0].color).toBe(marked ? "warning" : "error");
  },
);

it.each([true, false])(
  "preserves marked refusal identity through module-store confirmation, marked %s",
  async (marked) => {
    const create = vi.fn(() => ({ open: async () => true }));
    vi.stubGlobal("useOverlay", () => ({ create }));
    const consume = app.runWithContext(useReadOnlyRefusal);
    const store = app.runWithContext(useModuleStore);
    const entry = storeEntry("database");
    const actions = app.runWithContext(() =>
      useModuleStoreActions(store, ref([entry])),
    );
    const failure = marked ? readOnlyFailure() : unmarkedForbiddenFailure();
    vi.spyOn(store, "run").mockImplementation(async () => {
      consume(failure);
      throw failure;
    });
    await actions.runStoreAction("uninstall", entry);
    const dialog = create.mock.calls[0]?.[1].props;
    const submit = dialog.onConfirm();
    if (marked) await expect(submit).rejects.toBe(failure);
    else await expect(submit).rejects.toBeInstanceOf(ConfirmActionError);
    expect(add).toHaveBeenCalledTimes(marked ? 1 : 0);
  },
);

it.each([true, false])(
  "keeps module-store follow-up failures out of the inline alert, marked %s",
  async (marked) => {
    const store = app.runWithContext(useModuleStore);
    const failure = marked ? readOnlyFailure() : unmarkedForbiddenFailure();
    authFetch.mockRejectedValueOnce(failure);
    await store.load();
    expect(store.loadingError.value).toBe(marked ? null : failure);
    expect(add).toHaveBeenCalledTimes(marked ? 1 : 0);
  },
);

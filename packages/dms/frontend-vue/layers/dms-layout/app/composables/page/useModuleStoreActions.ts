import { isString } from "../../../../dms-core/app/utils/type-check";
import type { Ref, VNode } from "vue";
import ModuleStoreDependencyPicker from "../../build/components/pages/modules/ModuleStoreDependencyPicker.vue";
import {
  ConfirmActionError,
  useConfirm,
} from "#dms-ui/app/composables/confirm";
import {
  type ModuleStoreEntry,
  isAwaitingFrontend,
  needsDependencyChoice,
} from "../../build/utils/module-store-catalog";
import {
  type DependencyDraft,
  areDependencyDraftsValid,
  buildInstallBody,
  createDependencyDrafts,
} from "../../build/utils/module-store-install";
import type {
  StoreActionBody,
  StoreOperationKind,
} from "../../types/module-store";
import type { useModuleStore } from "./useModuleStore";

/** What a refused store request carries: the server's error key, if any. */
interface StoreRequestError {
  data?: unknown;
  message?: string;
}

/** What the frontend banner says while it lags behind the backend. */
export interface StoreFrontendNotice {
  key: "dev" | "production" | "unknown";
  names: string;
}

type ModuleStore = ReturnType<typeof useModuleStore>;

/**
 * The store's actions as both Modules views run them: the confirmations,
 * the install dialog that picks the modules for missing interfaces, and a
 * refusal worded from the server's error key. Also what the frontend banner
 * says while the interface lags behind the backend.
 */
export const useModuleStoreActions = (
  moduleStore: ModuleStore,
  entries: Ref<ModuleStoreEntry[]>,
) => {
  const { t } = useI18n();
  const { processI18n } = useTranslation();
  const toast = useToast();
  const { confirm } = useConfirm();

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Store requests can reject with arbitrary JavaScript values; the store's Promise contract has no rejection owner type.
  function resolveStoreError(error: unknown): string {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This existing unchecked optional-property view is not validation of a StoreRequestError; inference cannot establish that rejected values have this shape, and parsing would change malformed-error behavior.
    const details = error as StoreRequestError | undefined;
    const key = isString(details?.data) ? details.data : undefined;
    if (!key) return details?.message ?? "";
    return t(`modules.store.errors.${key.replace("error.", "")}`);
  }

  /**
   * Runs `kind` from a dialog: a refusal is worded as the toast words it and
   * shown in the dialog, which stays open.
   */
  async function runFromDialog(
    kind: StoreOperationKind,
    entry: ModuleStoreEntry,
    body?: StoreActionBody,
  ): Promise<void> {
    try {
      await moduleStore.run(kind, entry, body);
    } catch (error) {
      throw new ConfirmActionError({
        title: t("modules.store.action_failed", {
          module: processI18n(entry.title),
        }),
        description: resolveStoreError(error),
      });
    }
  }

  /** What the owner last picked in a module's install dialog, for a retry. */
  const lastDependencyDrafts = new Map<string, DependencyDraft[]>();

  function renderDependencyPicker(
    entry: ModuleStoreEntry,
    drafts: Ref<DependencyDraft[]>,
    showErrors: boolean,
  ): VNode {
    return h(ModuleStoreDependencyPicker, {
      missing: entry.missingInterfaces,
      drafts: drafts.value,
      showErrors,
      onUpdate: (index: number, patch: Partial<DependencyDraft>) => {
        drafts.value = drafts.value.map((draft, position) =>
          position === index ? { ...draft, ...patch } : draft,
        );
      },
    });
  }

  /**
   * Asks which modules implement the interfaces the release misses, then
   * installs them with it. A refusal shows in the dialog, kept open.
   */
  async function installWithDependencies(
    entry: ModuleStoreEntry,
  ): Promise<void> {
    const title = processI18n(entry.title);
    const drafts = ref(
      createDependencyDrafts(
        entry.missingInterfaces,
        lastDependencyDrafts.get(entry.id),
      ),
    );
    const showErrors = ref(false);
    await confirm({
      title: t("modules.store.install_dialog.title", { module: title }),
      description: t("modules.store.install_dialog.description", {
        module: title,
      }),
      confirmLabel: t("modules.store.actions.install"),
      confirmIcon: "i-ph-download-simple",
      icon: "i-ph-puzzle-piece",
      body: () => renderDependencyPicker(entry, drafts, showErrors.value),
      validate: () => {
        showErrors.value = true;
        return areDependencyDraftsValid(drafts.value);
      },
      onConfirm: async () => {
        lastDependencyDrafts.set(entry.id, drafts.value);
        await runFromDialog(
          "install",
          entry,
          buildInstallBody(entry.id, drafts.value),
        );
      },
    });
  }

  async function runStoreAction(
    kind: StoreOperationKind,
    entry: ModuleStoreEntry,
  ): Promise<void> {
    const title = processI18n(entry.title);
    if (needsDependencyChoice(entry, kind)) {
      await installWithDependencies(entry);
      return;
    }
    if (kind === "uninstall") {
      await confirm({
        title: t("modules.store.uninstall_confirm.title", { module: title }),
        description: t("modules.store.uninstall_confirm.description", {
          module: title,
        }),
        confirmLabel: t("modules.store.actions.uninstall"),
        color: "error",
        icon: "i-ph-trash",
        onConfirm: () => runFromDialog(kind, entry),
      });
      return;
    }
    try {
      await moduleStore.run(kind, entry);
    } catch (error) {
      toast.add({
        color: "error",
        icon: "i-ph-warning-circle",
        title: t("modules.store.action_failed", { module: title }),
        description: resolveStoreError(error),
      });
    }
  }

  /** Store modules whose interface the running frontend does not match yet. */
  const frontendNotice = computed<StoreFrontendNotice | null>(() => {
    const lagging = entries.value.filter(
      (entry) =>
        isAwaitingFrontend(entry) ||
        (entry.frontend === "unknown" &&
          moduleStore.awaitingReload.value.has(entry.id)),
    );
    if (lagging.length === 0) return null;
    const names = lagging.map((entry) => processI18n(entry.title)).join(", ");
    const hasReported = lagging.every((entry) => entry.frontend !== "unknown");
    const key = !hasReported
      ? "unknown"
      : moduleStore.listing.value?.dev
        ? "dev"
        : "production";
    return { key, names };
  });

  return { runStoreAction, frontendNotice };
};

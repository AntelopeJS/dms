import {
  computed,
  onScopeDispose,
  toValue,
  watch,
  type ComponentPublicInstance,
  type ComputedRef,
  type MaybeRefOrGetter,
} from "vue";
import { useLeaveGuard } from "#dms-core/app/composables/leave-guard";
import { useConfirm } from "../confirm/useConfirm";
import {
  confirmLeave,
  installBrowserLeaveGuards,
  registerUnsavedChanges,
} from "./registry";

/** The element a form renders, or the component rendering it. */
type ElementSource = Element | ComponentPublicInstance | null | undefined;

export interface UseUnsavedChangesOptions {
  /** Whether the form holds unsaved changes (see `useFormDirty`). */
  dirty: MaybeRefOrGetter<boolean>;
  /**
   * The drawer or modal the form sits in: closing it (X, Escape, a click
   * outside, Cancel) asks first. Left out, only leaving the page does.
   */
  containerId?: MaybeRefOrGetter<string | undefined>;
  /** The form's root: a tab switch hiding it asks first. */
  element?: MaybeRefOrGetter<ElementSource>;
}

export interface UseUnsavedChangesReturn {
  /** Whether the form holds unsaved changes. */
  isDirty: ComputedRef<boolean>;
  /**
   * Asks before throwing this form's changes away (a Cancel button of its
   * own, another entry picked in an editor); resolves `true` to go ahead,
   * straight away when there is nothing to lose.
   */
  confirmLeave: () => Promise<boolean>;
}

function resolveElement(source: ElementSource): Element | null {
  if (!source) return null;
  if (source instanceof Element) return source;
  const element = (source as ComponentPublicInstance).$el;
  return element instanceof Element ? element : null;
}

/**
 * The confirmation every form with unsaved changes asks before they are
 * lost, in the warning tone: "Discard unsaved changes?", with "Keep editing"
 * and "Discard changes".
 */
export function useDiscardChangesPrompt(): () => Promise<boolean> {
  const { confirm } = useConfirm();
  const { t } = useI18n();
  return () =>
    confirm({
      title: t("dms.leave_guard.title"),
      description: t("dms.leave_guard.description"),
      confirmLabel: t("dms.leave_guard.discard"),
      cancelLabel: t("dms.leave_guard.keep_editing"),
      // Staying is the safe answer: Enter keeps editing.
      initialFocus: "cancel",
      confirmColor: "warning",
      icon: "i-ph-warning",
    });
}

/**
 * Guards a form's unsaved changes: while it is dirty, leaving it (closing its
 * drawer or modal, navigating away, the browser's Back button, a reload or a
 * closed tab) asks once in a warning dialog. Nothing asks once it is saved,
 * discarded or put back as it was.
 */
export function useUnsavedChanges(
  options: UseUnsavedChangesOptions,
): UseUnsavedChangesReturn {
  const isDirty = computed(() => !!toValue(options.dirty));
  if (import.meta.env.SSR) {
    return { isDirty, confirmLeave: async () => true };
  }

  const prompt = useDiscardChangesPrompt();
  const route = useDmsRoute();
  const containerId = toValue(options.containerId);
  const { entry, unregister } = registerUnsavedChanges(
    {
      isDirty: () => isDirty.value,
      containerId,
      element: () => resolveElement(toValue(options.element)),
    },
    prompt,
  );
  const router = useDmsRouter();
  installBrowserLeaveGuards({
    path: () => route.path,
    revisit: (href) => router.push(href),
  });

  // A discarded form asks again once it was clean in between (another role
  // picked in the editor, then edited).
  watch(isDirty, (dirty) => {
    if (!dirty) entry.released = false;
  });

  // The drawer or modal runs its guards before closing.
  const removeGuard = containerId
    ? useLeaveGuard().addGuard(containerId, () => confirmLeave({ containerId }))
    : undefined;

  onScopeDispose(() => {
    unregister();
    removeGuard?.();
  });

  return { isDirty, confirmLeave: () => confirmLeave({ entry }) };
}

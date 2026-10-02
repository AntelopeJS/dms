import UFormField from "@nuxt/ui/components/FormField.vue";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import UInput from "@nuxt/ui/components/Input.vue";
import type { Component, Ref } from "vue";
import { downloadFile } from "#dms-core/app/utils/downloadFile";
import { useConfirm } from "#dms-ui/app/composables/confirm";
import {
  type ConfirmImpact,
  ConfirmTextError,
} from "#dms-ui/app/composables/confirm/types";
import { resolveFieldErrors } from "#dms-core/app/composables/useFieldErrors";
import { useSecurityFormat } from "../security/useSecurityFormat";

const PROFILE_ENDPOINT = "/settings/user/profile";
const EXPORT_ENDPOINT = `${PROFILE_ENDPOINT}/account-export`;
const DELETION_ENDPOINT = `${PROFILE_ENDPOINT}/account-deletion`;
const EXPORT_FILE_PREFIX = "dms-account-export";
const JSON_INDENT = 2;
const ISO_DATE_LENGTH = 10;
const AUTH_ROUTE = "/auth";
const I18N = "page.settings.profile.data";
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";
const CONFIRMATION_REFUSED = `$${I18N}.delete_error_confirmation`;
const SECURITY_ERRORS = "page.settings.security.errors";

/** Fields of the deletion dialog an API error can belong to. */
type DeletionField = "password" | "confirmation";

/** The password control of the deletion dialog, as `UInput` exposes it. */
interface PasswordInputHandle {
  inputRef?: HTMLInputElement;
}

/** Why the account cannot be deleted yet, as the API answers it. */
export interface DeletionBlocker {
  kind: "tenant" | "platform";
  tenantId?: string;
  tenantName?: string;
}

/** What deleting the account would remove, as the API answers it. */
export interface AccountDeletionImpact {
  email: string;
  hasPassword: boolean;
  memberships: number;
  sessions: number;
  notifications: number;
  externalIdentities: number;
  invitesSent: number;
  blockers: DeletionBlocker[];
}

/** The export file name: `dms-account-export-2026-10-01.json`. */
export function accountExportFilename(at: Date = new Date()): string {
  return `${EXPORT_FILE_PREFIX}-${at.toISOString().slice(0, ISO_DATE_LENGTH)}.json`;
}

/**
 * "Your data" on the profile page: download everything the DMS keeps about
 * the signed-in user, or delete the account after a password and a typed
 * e-mail, then sign out.
 */
export function useAccountData() {
  const { $authFetch } = useAuthFetch();
  const { confirm } = useConfirm();
  const { user, clear } = useUserSession<User>();
  const { removeAccount } = useMultiAccount();
  const { processI18n, processApiMessage } = useTranslation();
  const { errorMessage, errorCode } = useSecurityFormat();
  const toast = useToast();
  const { t } = useI18n();

  const isExporting = ref(false);
  const isCheckingDeletion = ref(false);

  /** A message key the API answers with (`$…`), else a known error code. */
  function describeError(error: unknown, fallbackKey: string): string {
    const code = errorCode(error);
    if (code?.startsWith("$")) return processI18n(code);
    return errorMessage(error, fallbackKey);
  }

  async function exportData(): Promise<void> {
    isExporting.value = true;
    try {
      const file = await $authFetch<unknown>(EXPORT_ENDPOINT);
      const blob = new Blob([JSON.stringify(file, null, JSON_INDENT)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      downloadFile(url, accountExportFilename());
      URL.revokeObjectURL(url);
      toast.add({
        color: "success",
        icon: "i-ph-check-circle",
        title: t(`${I18N}.export_done`),
      });
    } catch (error) {
      toast.add({
        color: "error",
        icon: "i-ph-warning-circle",
        title: describeError(error, `${I18N}.export_error`),
      });
    } finally {
      isExporting.value = false;
    }
  }

  function impactList(impact: AccountDeletionImpact): ConfirmImpact[] {
    return [
      {
        icon: "i-ph-users-three",
        label: t(`${I18N}.impact_memberships`),
        count: impact.memberships,
      },
      {
        icon: "i-ph-devices",
        label: t(`${I18N}.impact_sessions`),
        count: impact.sessions,
      },
      {
        icon: "i-ph-bell",
        label: t(`${I18N}.impact_notifications`),
        count: impact.notifications,
      },
      {
        icon: "i-ph-link",
        label: t(`${I18N}.impact_identities`),
        count: impact.externalIdentities,
      },
      {
        icon: "i-ph-envelope-simple",
        label: t(`${I18N}.impact_invites`),
        count: impact.invitesSent,
      },
    ];
  }

  /**
   * The password of the deletion dialog; a wrong one shows under it (the
   * field marks itself invalid and describes the input with it).
   */
  function passwordField(
    password: Ref<string>,
    error: Ref<string | undefined>,
    input: Ref<PasswordInputHandle | null>,
  ) {
    return () =>
      h(
        UFormField,
        { label: t(`${I18N}.delete_password`), error: error.value },
        {
          default: () =>
            // Generic in its value type, which `h` cannot infer.
            h(UInput as Component, {
              ref: input,
              modelValue: password.value,
              type: "password",
              autocomplete: "current-password",
              class: "w-full",
              "onUpdate:modelValue": (value: unknown) => {
                password.value = typeof value === "string" ? value : "";
                error.value = undefined;
              },
            }),
          error: ({ error: message }: { error?: string | boolean }) =>
            message
              ? [
                  h(UIcon, {
                    name: "i-ph-warning-circle",
                    class: "size-3.5 shrink-0",
                  }),
                  String(message),
                ]
              : [],
        },
      );
  }

  function blockerNames(blockers: DeletionBlocker[]): string {
    return blockers
      .map((blocker) =>
        blocker.kind === "platform"
          ? t(`${I18N}.blocker_platform`)
          : (blocker.tenantName ?? blocker.tenantId ?? ""),
      )
      .join(", ");
  }

  async function explainBlockers(blockers: DeletionBlocker[]): Promise<void> {
    await confirm({
      title: t(`${I18N}.blocked_title`),
      description: t(`${I18N}.blocked_description`, {
        names: blockerNames(blockers),
      }),
      icon: "i-ph-crown-simple",
      confirmColor: "warning",
      hideConfirm: true,
      cancelLabel: t(`${I18N}.blocked_close`),
    });
  }

  async function signOutDeleted(): Promise<void> {
    const userId = user.value?._id;
    await clear().catch(() => undefined);
    if (userId) await removeAccount(userId).catch(() => undefined);
    toast.add({
      color: "success",
      icon: "i-ph-check-circle",
      title: t(`${I18N}.delete_done_title`),
      description: t(`${I18N}.delete_done_description`),
    });
    await navigateDms(AUTH_ROUTE);
  }

  /**
   * Sends the deletion. A wrong password shows under the password field, a
   * refused e-mail under the typed one; anything else is a toast. The dialog
   * stays open on every failure.
   */
  async function submitDeletion(
    impact: AccountDeletionImpact,
    password: string,
    passwordError: Ref<string | undefined>,
    passwordInput: Ref<PasswordInputHandle | null>,
  ): Promise<boolean> {
    passwordError.value = undefined;
    try {
      await $authFetch(DELETION_ENDPOINT, {
        method: "POST",
        body: {
          password: impact.hasPassword ? password : undefined,
          confirmation: impact.email,
        },
      });
      return true;
    } catch (error) {
      const [fieldError] = resolveFieldErrors<DeletionField>(error, {
        fields: impact.hasPassword
          ? ["password", "confirmation"]
          : ["confirmation"],
        codes: {
          [INVALID_CURRENT_PASSWORD]: {
            field: "password",
            message: `${SECURITY_ERRORS}.invalid_current_password`,
          },
          [CONFIRMATION_REFUSED]: "confirmation",
        },
      }).fields;
      if (fieldError?.field === "confirmation") {
        throw new ConfirmTextError(processApiMessage(fieldError.message));
      }
      if (fieldError?.field === "password") {
        passwordError.value = processApiMessage(fieldError.message);
        await nextTick();
        passwordInput.value?.inputRef?.focus();
        return false;
      }
      toast.add({
        color: "error",
        icon: "i-ph-warning-circle",
        title: describeError(error, `${I18N}.delete_error`),
      });
      return false;
    }
  }

  async function confirmDeletion(impact: AccountDeletionImpact): Promise<void> {
    const password = ref("");
    const passwordError = ref<string>();
    const passwordInput = ref<PasswordInputHandle | null>(null);
    const confirmed = await confirm({
      title: t(`${I18N}.delete_confirm_title`),
      description: t(`${I18N}.delete_confirm_description`),
      icon: "i-ph-warning",
      confirmColor: "error",
      confirmIcon: "i-ph-trash",
      confirmLabel: t(`${I18N}.delete_confirm_button`),
      impact: impactList(impact),
      body: impact.hasPassword
        ? passwordField(password, passwordError, passwordInput)
        : undefined,
      confirmText: impact.email,
      onConfirm: () =>
        submitDeletion(impact, password.value, passwordError, passwordInput),
    });
    if (confirmed) await signOutDeleted();
  }

  async function deleteAccount(): Promise<void> {
    isCheckingDeletion.value = true;
    let impact: AccountDeletionImpact;
    try {
      impact = await $authFetch<AccountDeletionImpact>(DELETION_ENDPOINT);
    } catch (error) {
      toast.add({
        color: "error",
        icon: "i-ph-warning-circle",
        title: describeError(error, `${I18N}.delete_error`),
      });
      return;
    } finally {
      isCheckingDeletion.value = false;
    }
    if (impact.blockers.length > 0) return explainBlockers(impact.blockers);
    return confirmDeletion(impact);
  }

  return { isExporting, isCheckingDeletion, exportData, deleteAccount };
}

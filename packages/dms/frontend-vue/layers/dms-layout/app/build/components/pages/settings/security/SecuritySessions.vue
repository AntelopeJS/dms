<script setup lang="ts">
import { MONO_CHIP_CLASS } from "#dms-ui/app/build/utils/monoChip";
import { useSecurityFormat } from "../../../../composables/settings/security/useSecurityFormat";
import {
  SECURITY_ENDPOINT,
  useSecurityOverview,
} from "../../../../composables/settings/security/useSecurityOverview";
import {
  type SessionHandoff,
  useSessionHandoff,
} from "../../../../composables/security/useSessionHandoff";

interface SessionInfo {
  _id: string;
  browser: string;
  os: string;
  ip: string;
  deviceType: string;
  location: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

interface SessionsRevokedResponse {
  count: number;
  sessionHandoff?: SessionHandoff;
}

const SESSIONS_URL = `${SECURITY_ENDPOINT}/sessions`;
const OTHER_SESSIONS_URL = `${SECURITY_ENDPOINT}/other-sessions`;
const SKELETON_COUNT = 3;
// "Chrome 150.0.7871.250" reads as "Chrome": the version is noise here.
const BROWSER_VERSION = /\s+[\d.]+$/;
const DEFAULT_DEVICE_ICON = "i-ph-desktop";
const DEVICE_ICONS: Record<string, string> = {
  desktop: "i-ph-desktop",
  mobile: "i-ph-device-mobile",
  tablet: "i-ph-device-tablet",
};

const { t } = useI18n();
const toast = useToast();
const { $authFetch } = useAuthFetch();
const adoptSessionHandoff = useSessionHandoff();
const { overview, refresh: refreshOverview } = useSecurityOverview();
const { formatDate, formatRelative, errorMessage } = useSecurityFormat();

const isLoading = ref(true);
const sessions = ref<SessionInfo[]>([]);
const revokingId = ref<string | null>(null);
const isConfirmOpen = ref(false);
const isSigningOutOthers = ref(false);

const otherSessions = computed(() =>
  sessions.value.filter((session) => !session.isCurrent),
);

const deviceIcon = (session: SessionInfo): string =>
  DEVICE_ICONS[session.deviceType] ?? DEFAULT_DEVICE_ICON;

const sessionName = (session: SessionInfo): string =>
  t("page.settings.security.sessions.device_name", {
    browser:
      (session.browser ?? "").replace(BROWSER_VERSION, "") ||
      t("page.settings.security.sessions.unknown"),
    os: session.os || t("page.settings.security.sessions.unknown"),
  });

const sessionPlace = (session: SessionInfo): string =>
  session.location || t("page.settings.sessions.unknown_location");

async function fetchSessions(): Promise<void> {
  sessions.value = await $authFetch<SessionInfo[]>(SESSIONS_URL);
}

async function revoke(session: SessionInfo): Promise<void> {
  revokingId.value = session._id;
  try {
    await $authFetch(`${SESSIONS_URL}/${session._id}`, { method: "DELETE" });
    sessions.value = sessions.value.filter(
      (entry) => entry._id !== session._id,
    );
    toast.add({ title: t("page.settings.sessions.revoked"), color: "success" });
    await refreshOverview();
  } catch (error) {
    toast.add({
      title: errorMessage(error, "page.settings.sessions.revoke_error"),
      color: "error",
    });
  } finally {
    revokingId.value = null;
  }
}

async function signOutOthers(): Promise<void> {
  isSigningOutOthers.value = true;
  try {
    const response = await $authFetch<SessionsRevokedResponse>(
      OTHER_SESSIONS_URL,
      { method: "DELETE" },
    );
    await adoptSessionHandoff(response.sessionHandoff);
    isConfirmOpen.value = false;
    toast.add({
      title: t(
        "page.settings.security.sessions.signed_out_others",
        { count: response.count },
        response.count,
      ),
      color: "success",
    });
    await Promise.all([fetchSessions(), refreshOverview()]);
  } catch (error) {
    toast.add({
      title: errorMessage(error, "page.settings.sessions.revoke_all_error"),
      color: "error",
    });
  } finally {
    isSigningOutOthers.value = false;
  }
}

// Another block (a password change signing out the other devices) can end
// sessions: the shared count moving is the cue to reload the list.
watch(
  () => overview.value?.activeSessions,
  (count, previous) => {
    if (previous !== undefined && count !== sessions.value.length) {
      void fetchSessions();
    }
  },
);

onMounted(async () => {
  try {
    await fetchSessions();
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <DmsSection
    id="sessions"
    class="scroll-mt-6"
    title="$page.settings.sessions.title"
    description="$page.settings.security.sessions.description"
  >
    <template v-if="!isLoading" #badge>
      <span class="text-muted font-mono text-[11.5px] font-medium tabular-nums">
        {{
          t(
            "page.settings.security.sessions_active",
            { count: sessions.length },
            sessions.length,
          )
        }}
      </span>
    </template>
    <template v-if="otherSessions.length" #trail>
      <UButton
        color="error"
        variant="outline"
        size="sm"
        icon="i-ph-sign-out"
        :label="t('page.settings.security.sessions.sign_out_others')"
        @click="isConfirmOpen = true"
      />
    </template>

    <div v-if="isLoading" class="grid gap-3 px-[18px] py-4">
      <USkeleton
        v-for="index in SKELETON_COUNT"
        :key="index"
        class="h-10 w-full"
      />
    </div>
    <DmsEmptyState
      v-else-if="!sessions.length"
      icon="i-ph-devices"
      :title="t('page.settings.sessions.empty')"
      size="sm"
    />
    <template v-else>
      <DmsListRow
        v-for="session in sessions"
        :key="session._id"
        :icon="deviceIcon(session)"
        :tone="session.isCurrent ? 'accent' : 'muted'"
        :current="session.isCurrent"
      >
        {{ sessionName(session) }}
        <UBadge
          v-if="session.isCurrent"
          color="success"
          variant="subtle"
          size="sm"
          :label="t('page.settings.security.sessions.this_device')"
        />
        <template #meta>
          <span>{{ sessionPlace(session) }}</span>
          <span v-if="session.ip">
            <span
              :class="[
                MONO_CHIP_CLASS,
                'bg-elevated text-toned text-[11.5px] font-medium',
              ]"
            >
              {{ session.ip }}
            </span>
          </span>
          <span v-if="session.isCurrent">
            <DmsStatusPill
              tone="success"
              variant="text"
              :label="t('page.settings.security.sessions.active_now')"
            />
          </span>
          <span v-else>
            {{
              t("page.settings.security.sessions.active_ago", {
                time: formatRelative(session.lastActiveAt),
              })
            }}
          </span>
        </template>
        <template #trailing>
          <span v-if="session.isCurrent" class="text-muted text-xs">
            {{
              t("page.settings.security.sessions.signed_in", {
                date: formatDate(session.createdAt),
              })
            }}
          </span>
          <UButton
            v-else
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-ph-sign-out"
            :loading="revokingId === session._id"
            :label="t('page.settings.security.sessions.sign_out')"
            :aria-label="
              t('page.settings.security.sessions.sign_out_named', {
                name: sessionName(session),
                place: sessionPlace(session),
              })
            "
            @click="revoke(session)"
          />
        </template>
      </DmsListRow>
    </template>

    <UModal v-model:open="isConfirmOpen" :ui="{ content: 'max-w-md' }">
      <template #header>
        <div class="flex items-start gap-3">
          <DmsIconWell icon="i-ph-sign-out" tone="error" size="xl" />
          <h3 class="text-highlighted pt-2 text-base font-semibold">
            {{
              t(
                "page.settings.security.sessions.confirm_title",
                { count: otherSessions.length },
                otherSessions.length,
              )
            }}
          </h3>
        </div>
      </template>
      <template #body>
        <p class="text-muted text-sm">
          {{ t("page.settings.security.sessions.confirm_description") }}
        </p>
        <ul
          class="border-default mt-3.5 rounded-md border bg-(--dms-bg-muted) px-3 py-0.5"
        >
          <li
            v-for="session in sessions"
            :key="session._id"
            class="text-toned border-muted flex items-center gap-2.5 border-t py-2 text-sm first:border-t-0"
          >
            <UIcon
              :name="deviceIcon(session)"
              class="text-dimmed size-4 shrink-0"
            />
            <span class="min-w-0">
              {{ sessionName(session) }}
              <template v-if="session.isCurrent">
                · {{ t("page.settings.security.sessions.this_device_lower") }}
              </template>
              <small class="text-dimmed block text-xs">
                {{ sessionPlace(session) }} ·
                {{
                  session.isCurrent
                    ? t("page.settings.security.sessions.active_now_lower")
                    : formatRelative(session.lastActiveAt)
                }}
              </small>
            </span>
            <span
              class="ms-auto font-mono text-[11px] font-medium whitespace-nowrap"
              :class="session.isCurrent ? 'text-success' : 'text-error'"
            >
              {{
                session.isCurrent
                  ? t("page.settings.security.sessions.stays_signed_in")
                  : t("page.settings.security.sessions.will_sign_out")
              }}
            </span>
          </li>
        </ul>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <span class="text-dimmed me-auto flex items-center gap-1.5 text-xs">
            <UKbd value="Esc" size="sm" />
            {{ t("page.settings.security.esc_to_cancel") }}
          </span>
          <UButton
            color="neutral"
            variant="outline"
            :label="t('page.settings.security.cancel')"
            @click="isConfirmOpen = false"
          />
          <UButton
            color="error"
            :loading="isSigningOutOthers"
            :label="
              t(
                'page.settings.security.sessions.confirm_submit',
                { count: otherSessions.length },
                otherSessions.length,
              )
            "
            @click="signOutOthers"
          />
        </div>
      </template>
    </UModal>
  </DmsSection>
</template>

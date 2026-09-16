<script setup lang="ts">
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

interface DeviceGroupConfig {
  key: string;
  icon: string;
  label: string;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const MIN_MINUTE_THRESHOLD = 1;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SKELETON_COUNT = 3;

const SESSION_DETAIL_GRID_CLASS = "grid grid-cols-[160px_1fr] gap-1 text-sm";

const DEVICE_GROUPS: DeviceGroupConfig[] = [
  {
    key: "mobile",
    icon: "i-ph-device-mobile",
    label: "page.settings.sessions.device_mobile",
  },
  {
    key: "tablet",
    icon: "i-ph-device-tablet",
    label: "page.settings.sessions.device_tablet",
  },
  {
    key: "desktop",
    icon: "i-ph-desktop",
    label: "page.settings.sessions.device_desktop",
  },
];

const { $authFetch } = useAuthFetch();
const { clear } = useUserSession();
const toast = useToast();
const { t } = useI18n();

const isLoading = ref(true);
const sessions = ref<SessionInfo[]>([]);
const isDisconnectingAll = ref(false);
const revokingSessionId = ref<string | null>(null);
const expandedGroups = ref<Record<string, boolean>>({});

const groupedSessions = computed(() => {
  const groups: Record<string, SessionInfo[]> = {};
  for (const session of sessions.value) {
    const type = session.deviceType || "desktop";
    if (!groups[type]) groups[type] = [];
    groups[type].push(session);
  }
  return groups;
});

const activeGroups = computed(() =>
  DEVICE_GROUPS.filter((group) => groupedSessions.value[group.key]?.length),
);

const getGroupSubtitle = (groupKey: string): string => {
  const groupSessions = groupedSessions.value[groupKey] || [];
  const uniqueOs = [...new Set(groupSessions.map((s) => s.os).filter(Boolean))];
  return uniqueOs.join(", ");
};

const toggleGroup = (groupKey: string) => {
  expandedGroups.value[groupKey] = !expandedGroups.value[groupKey];
};

const formatDateTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatRelativeTime = (dateStr: string): string => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMinutes = Math.floor(diffMs / MS_PER_MINUTE);
  const diffHours = Math.floor(diffMs / MS_PER_HOUR);
  const diffDays = Math.floor(diffMs / MS_PER_DAY);

  if (diffMinutes < MIN_MINUTE_THRESHOLD)
    return t("page.settings.sessions.just_now");
  if (diffMinutes < MINUTES_PER_HOUR)
    return t("page.settings.sessions.minutes_ago", { count: diffMinutes });
  if (diffHours < HOURS_PER_DAY)
    return t("page.settings.sessions.hours_ago", { count: diffHours });
  return t("page.settings.sessions.days_ago", { count: diffDays });
};

const fetchSessions = async () => {
  sessions.value = await $authFetch<SessionInfo[]>(
    "/settings/user/profile/sessions",
  );
};

const revokeSession = async (session: SessionInfo) => {
  revokingSessionId.value = session._id;
  try {
    await $authFetch(`/settings/user/profile/sessions/${session._id}`, {
      method: "DELETE",
    });

    if (session.isCurrent) {
      await clear();
      await navigateDms("/auth");
      return;
    }

    sessions.value = sessions.value.filter((s) => s._id !== session._id);
    toast.add({
      title: t("page.settings.sessions.revoked"),
      color: "success",
    });
  } catch {
    toast.add({
      title: t("page.settings.sessions.revoke_error"),
      color: "error",
    });
  } finally {
    revokingSessionId.value = null;
  }
};

const revokeAllSessions = async () => {
  isDisconnectingAll.value = true;
  try {
    await $authFetch("/settings/user/profile/sessions", {
      method: "DELETE",
    });
    await clear();
    await navigateDms("/auth");
  } catch {
    toast.add({
      title: t("page.settings.sessions.revoke_all_error"),
      color: "error",
    });
    isDisconnectingAll.value = false;
  }
};

onMounted(async () => {
  try {
    await fetchSessions();
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <DmsCard class="my-5">
    <section class="space-y-1">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-highlighted text-2xl font-semibold sm:text-xl">
            {{ $t("page.settings.sessions.title") }}
          </h2>
          <p class="text-dimmed text-base sm:text-sm">
            {{ $t("page.settings.sessions.description") }}
          </p>
        </div>
        <UButton
          v-if="!isLoading && sessions.length > 0"
          color="neutral"
          variant="outline"
          icon="i-ph-sign-out"
          :loading="isDisconnectingAll"
          @click="revokeAllSessions"
        >
          {{ $t("page.settings.sessions.disconnect_all") }}
        </UButton>
      </div>
    </section>

    <USeparator class="my-6" />

    <div v-if="isLoading" class="space-y-4">
      <USkeleton
        v-for="i in SKELETON_COUNT"
        :key="i"
        class="h-16 w-full rounded-lg"
      />
    </div>

    <UEmpty
      v-else-if="sessions.length === 0"
      icon="i-ph-devices"
      :title="$t('page.settings.sessions.empty')"
    />

    <div v-else class="space-y-3">
      <div
        v-for="group in activeGroups"
        :key="group.key"
        class="border-default overflow-hidden rounded-lg border"
      >
        <button
          class="flex w-full items-center gap-3 px-4 py-3 text-left"
          @click="toggleGroup(group.key)"
        >
          <UIcon :name="group.icon" class="text-dimmed size-6" />
          <div class="flex-1">
            <div class="text-highlighted text-sm font-medium">
              {{
                $t("page.settings.sessions.sessions_on_device", {
                  count: groupedSessions[group.key]!.length,
                  device: $t(group.label).toLowerCase(),
                })
              }}
            </div>
            <div class="text-muted text-xs">
              {{ getGroupSubtitle(group.key) }}
            </div>
          </div>
          <UIcon
            name="i-ph-caret-down"
            class="text-muted size-4 transition-transform"
            :class="{ 'rotate-180': expandedGroups[group.key] }"
          />
        </button>

        <div v-if="expandedGroups[group.key]" class="px-4 pb-4">
          <div
            v-for="(session, index) in groupedSessions[group.key]"
            :key="session._id"
          >
            <USeparator v-if="index > 0" class="my-4" />

            <div class="flex items-center justify-between py-2">
              <div class="flex items-center gap-2">
                <span class="text-highlighted text-sm font-semibold">
                  {{
                    $t("page.settings.sessions.session_number", {
                      number: index + 1,
                    })
                  }}
                </span>
                <UBadge
                  v-if="session.isCurrent"
                  color="success"
                  variant="subtle"
                  size="sm"
                >
                  {{ $t("page.settings.sessions.current") }}
                </UBadge>
              </div>
              <UButton
                color="neutral"
                variant="outline"
                icon="i-ph-sign-out"
                size="sm"
                :loading="revokingSessionId === session._id"
                @click="revokeSession(session)"
              >
                {{ $t("page.settings.sessions.disconnect") }}
              </UButton>
            </div>

            <div class="mt-2 space-y-2">
              <div :class="SESSION_DETAIL_GRID_CLASS">
                <span class="text-muted">
                  {{ $t("page.settings.sessions.date_time") }}
                </span>
                <div>
                  <UTooltip :text="formatRelativeTime(session.createdAt)">
                    <span class="text-highlighted">
                      {{ formatDateTime(session.createdAt) }}
                    </span>
                  </UTooltip>
                </div>
              </div>
              <div :class="SESSION_DETAIL_GRID_CLASS">
                <span class="text-muted">
                  {{ $t("page.settings.sessions.location") }}
                </span>
                <span class="text-highlighted">
                  {{
                    session.location ||
                    $t("page.settings.sessions.unknown_location")
                  }}
                </span>
              </div>
              <div :class="SESSION_DETAIL_GRID_CLASS">
                <span class="text-muted">
                  {{ $t("page.settings.sessions.operating_system") }}
                </span>
                <span class="text-highlighted">{{ session.os }}</span>
              </div>
              <div :class="SESSION_DETAIL_GRID_CLASS">
                <span class="text-muted">
                  {{ $t("page.settings.sessions.browser_label") }}
                </span>
                <span class="text-highlighted">{{ session.browser }}</span>
              </div>
              <div :class="SESSION_DETAIL_GRID_CLASS">
                <span class="text-muted">
                  {{ $t("page.settings.sessions.ip_address") }}
                </span>
                <span class="text-highlighted">{{ session.ip }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </DmsCard>
</template>

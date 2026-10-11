<script setup lang="ts">
import {
  TILE_ROW_CLASS,
  TILE_ROW_INTERACTIVE_CLASS,
} from "#dms-ui/app/build/utils/tileRow";
import StageCard from "../../../../dms-layout/app/build/components/layout/StageCard.vue";

const ACCOUNT_SKELETON_ROWS = 2;

const { t } = useI18n();
const toast = useToast();
const homepage = useHomepage();
const {
  accounts,
  getActiveAccount,
  addCurrentAccount,
  switchAccount,
  removeAccount,
  validateAllAccounts,
} = useMultiAccount();

const loading = ref<string | null>(null);
const pendingValidation = ref<Promise<unknown> | null>(null);
const activeAccount = computed(() => getActiveAccount());

const sortedAccounts = computed(() => {
  const active = activeAccount.value;
  const inactive = accounts.value.filter((a) => a.userId !== active?.userId);

  return active ? [active, ...inactive] : inactive;
});

async function handleSwitchAccount(userId: string) {
  if (loading.value) {
    return;
  }

  if (userId === activeAccount.value?.userId) {
    await navigateDms(homepage);

    return;
  }

  loading.value = userId;

  try {
    await pendingValidation.value;
    await switchAccount(userId);

    await navigateDms(homepage);
  } catch (error: unknown) {
    useApiError(error, {
      title: "error.switch_account_failed",
    });
  } finally {
    loading.value = null;
  }
}

async function handleRemoveAccount(userId: string) {
  await removeAccount(userId);
  toast.add({
    title: t("page.accounts.account_removed"),
    color: "success",
  });
}

function handleAddAccount() {
  addCurrentAccount();
  navigateDms({ path: "/auth", query: FROM_ACCOUNTS_QUERY });
}

onMounted(() => {
  pendingValidation.value = validateAllAccounts();
});
</script>

<template>
  <StageCard
    icon="i-ph-users"
    :title="$t('page.accounts.title')"
    :description="$t('page.accounts.description')"
  >
    <ul class="mt-[22px] grid gap-2">
      <DmsClientOnly>
        <li
          v-for="account in sortedAccounts"
          :key="account.userId"
          :class="[TILE_ROW_INTERACTIVE_CLASS, 'group relative py-2.5']"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 text-start after:absolute after:inset-0 after:rounded-[10px] focus-visible:outline-none focus-visible:after:shadow-(--dms-focus-ring)"
            :disabled="loading !== null"
            @click="handleSwitchAccount(account.userId)"
          >
            <UAvatar :alt="account.name" size="md" />

            <span class="min-w-0">
              <span class="flex items-center gap-2">
                <span
                  class="text-highlighted truncate text-[13.5px] font-semibold"
                >
                  {{ account.name }}
                </span>
                <UBadge
                  v-if="account.userId === activeAccount?.userId"
                  color="success"
                  size="sm"
                >
                  {{ $t("page.accounts.active_account") }}
                </UBadge>
                <UBadge v-else-if="account.isExpired" color="warning" size="sm">
                  {{ $t("page.accounts.expired_account") }}
                </UBadge>
              </span>
              <span class="text-muted block truncate text-xs">
                {{ account.email }}
              </span>
            </span>
          </button>

          <UIcon
            v-if="loading === account.userId"
            name="i-ph-spinner-gap"
            class="text-muted size-4 animate-spin"
          />
          <UButton
            v-else-if="account.userId !== activeAccount?.userId"
            icon="i-ph-x"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            :aria-label="
              $t('page.accounts.remove_account', { name: account.name })
            "
            :disabled="loading !== null"
            class="relative z-10 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
            @click="handleRemoveAccount(account.userId)"
          />
          <UIcon v-else name="i-ph-arrow-right" class="text-dimmed size-4" />
        </li>

        <template #fallback>
          <li
            v-for="row in ACCOUNT_SKELETON_ROWS"
            :key="row"
            :class="[TILE_ROW_CLASS, 'py-2.5']"
          >
            <USkeleton
              :aria-label="t('dms.a11y.loading')"
              class="size-8 rounded-full"
            />
            <span class="grid gap-1.5">
              <USkeleton
                :aria-label="t('dms.a11y.loading')"
                class="h-3.5 w-32"
              />
              <USkeleton :aria-label="t('dms.a11y.loading')" class="h-3 w-44" />
            </span>
          </li>
        </template>
      </DmsClientOnly>
    </ul>

    <UButton
      :label="$t('page.accounts.add_account')"
      icon="i-ph-plus"
      color="neutral"
      variant="outline"
      size="lg"
      class="mt-4 justify-center"
      block
      @click="handleAddAccount"
    />
  </StageCard>
</template>

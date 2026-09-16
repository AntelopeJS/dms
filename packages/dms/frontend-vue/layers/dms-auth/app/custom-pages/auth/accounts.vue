<script setup lang="ts">
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
  <div class="mx-auto max-w-lg">
    <DmsCard variant="elevated" :padded="false" class="p-4">
      <div class="pb-8">
        <h1 class="text-xl font-bold sm:text-2xl">
          {{ $t("page.accounts.title") }}
        </h1>
        <p class="text-muted text-sm">
          {{ $t("page.accounts.description") }}
        </p>
      </div>

      <div class="space-y-3">
        <DmsClientOnly>
          <DmsCard
            v-for="account in sortedAccounts"
            :key="account.userId"
            interactive
            :padded="false"
            class="group flex items-center justify-between p-4"
            @click="handleSwitchAccount(account.userId)"
          >
            <div class="flex items-center gap-4">
              <UAvatar :alt="account.name" size="xl" />

              <div>
                <div class="flex items-center gap-2">
                  <span class="font-medium">{{ account.name }}</span>

                  <UBadge
                    v-if="account.userId === activeAccount?.userId"
                    variant="subtle"
                    size="sm"
                  >
                    {{ $t("page.accounts.active_account") }}
                  </UBadge>

                  <UBadge v-else-if="account.isExpired" color="error" size="sm">
                    {{ $t("page.accounts.expired_account") }}
                  </UBadge>
                </div>

                <span class="text-muted text-sm">
                  {{ account.email }}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <UIcon
                v-if="loading === account.userId"
                name="i-ph-spinner"
                class="animate-spin text-lg"
              />

              <UButton
                v-if="account.userId !== activeAccount?.userId"
                icon="i-ph-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="loading !== null"
                class="opacity-0 transition-opacity group-hover:opacity-100"
                @click.stop="handleRemoveAccount(account.userId)"
              />
            </div>
          </DmsCard>

          <template #fallback>
            <DmsCard
              v-for="i in 2"
              :key="i"
              :padded="false"
              class="flex items-center justify-between p-4"
            >
              <div class="flex items-center gap-4">
                <USkeleton class="size-16 rounded-full" />
                <div class="space-y-2">
                  <USkeleton class="h-4 w-32" />
                  <USkeleton class="h-3 w-48" />
                </div>
              </div>
            </DmsCard>
          </template>
        </DmsClientOnly>

        <UButton
          block
          variant="outline"
          icon="i-ph-plus"
          class="mt-6"
          @click="handleAddAccount"
        >
          {{ $t("page.accounts.add_account") }}
        </UButton>
      </div>
    </DmsCard>
  </div>
</template>

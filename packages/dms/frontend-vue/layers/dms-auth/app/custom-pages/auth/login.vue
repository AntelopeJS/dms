<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { ACCOUNTS_LIST_ROUTE } from "../../utils/accountsFlow";

const route = useDmsRoute();
const homepage = useHomepage();
const dmsApp = useDmsApp();
const { links: extraLinks } = useAuthLinks("login");

useOAuthErrorToast();

const isLoading = ref(false);
const isPasswordVisible = ref(false);

const cameFromAccounts = computed(() => isFromAccountsList(route.query));

const schema = z.object({
  email: z.string().email(),
  password: z.string().nonempty(),
  keep_login: z.boolean().optional(),
});
type Schema = z.output<typeof schema>;
const state = reactive<Partial<Schema>>({});

function isTwoFactorRequired(
  response: unknown,
): response is TwoFactorRequiredResponse {
  return (
    !!response && typeof response === "object" && "requires_2fa" in response
  );
}

function isTenantAssignmentRequired(
  response: unknown,
): response is TenantAssignmentRequiredResponse {
  return (
    !!response &&
    typeof response === "object" &&
    "requires_tenant_assignment" in response
  );
}

async function handleTwoFactorRedirect(response: TwoFactorRequiredResponse) {
  await navigateDms({
    path: "/auth/2fa",
    query: withAccountsFlag(route.query, {
      token: response.two_factor_token,
      methods: response.methods.join(","),
    }),
  });
}

async function handleTenantAssignmentRedirect(
  response: TenantAssignmentRequiredResponse,
) {
  await navigateDms({
    path: "/auth/no-workspace",
    query: {
      token: response.tenant_assignment_token,
    },
  });
}

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  const redirectUrl = route.query.redirect as string | undefined;

  try {
    isLoading.value = true;

    const response = await $fetch("/auth/login", {
      method: "POST",
      body: payload.data,
    });

    if (isTwoFactorRequired(response)) {
      await dmsApp.runWithContext(() => handleTwoFactorRedirect(response));
      return;
    }

    if (isTenantAssignmentRequired(response)) {
      await dmsApp.runWithContext(() =>
        handleTenantAssignmentRedirect(response),
      );
      return;
    }

    await dmsApp.runWithContext(() =>
      usePostLoginRedirect(redirectUrl || homepage),
    );
  } catch (error: unknown) {
    await dmsApp.runWithContext(() =>
      useApiError(error, {
        title: "page.auth.error_title",
      }),
    );
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg">
    <DmsCard
      as="section"
      variant="elevated"
      :padded="false"
      class="p-6 sm:p-12"
    >
      <h1 class="pb-11 text-xl font-bold sm:text-2xl">
        {{ $t("page.auth.login_title") }}
      </h1>

      <DmsOAuthButtons />

      <UForm
        :schema="schema"
        :state="state"
        class="space-y-7"
        @submit="onSubmit"
      >
        <UFormField :label="$t('form.email.label')" name="email">
          <UInput v-model="state.email" class="w-full" />
        </UFormField>

        <UFormField :label="$t('form.password.label')" name="password">
          <template #hint>
            <DmsLink
              to="/auth/forgot"
              tabindex="-1"
              class="text-primary text-sm"
            >
              {{ $t("form.password.recover") }}
            </DmsLink>
          </template>

          <UInput
            v-model="state.password"
            :type="isPasswordVisible ? 'text' : 'password'"
            class="w-full"
          >
            <template #trailing>
              <UButton
                :icon="isPasswordVisible ? 'i-ph-eye-slash' : 'i-ph-eye'"
                square
                size="xs"
                variant="ghost"
                color="neutral"
                type="button"
                tabindex="-1"
                @click="isPasswordVisible = !isPasswordVisible"
              />
            </template>
          </UInput>
        </UFormField>

        <UFormField name="keep_login">
          <UCheckbox
            v-model="state.keep_login"
            :label="$t('page.auth.keep_login')"
          />
        </UFormField>

        <div class="grid gap-2">
          <UButton
            :loading="isLoading"
            :label="$t('button.login')"
            type="submit"
            block
          />

          <UButton
            v-if="cameFromAccounts"
            :label="$t('page.auth.back_to_accounts')"
            icon="i-ph-arrow-left"
            color="neutral"
            variant="ghost"
            :disabled="isLoading"
            :to="ACCOUNTS_LIST_ROUTE"
            type="button"
            block
          />
        </div>
      </UForm>

      <div
        v-if="extraLinks.length"
        class="mt-6 flex flex-col items-center gap-2"
      >
        <DmsLink
          v-for="link in extraLinks"
          :key="link.id"
          :to="link.to"
          class="text-primary text-sm"
        >
          {{ $t(link.label) }}
        </DmsLink>
      </div>
    </DmsCard>
  </div>
</template>

<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import striptags from "striptags";

const { t } = useI18n();
const { $authFetch } = useAuthFetch();
const toast = useToast();
const dmsApp = useDmsApp();
const { siteLayoutTree } = useSiteLayout();
const homepage = useHomepage();

const MIN_VALID_PASSWORD_SCORE = 4;
const LOGIN_PATH = "/auth";

const isLoading = ref(false);
const isRegistered = ref(false);
const isPasswordVisible = ref(false);

const schema = z
  .object({
    email: z.string().trim().email(),
    name: z
      .string()
      .trim()
      .min(2, { message: t("form.error.min_two") }),
    password: passwordSchema,
  })
  .transform((data) => ({
    email: striptags(data.email),
    name: striptags(data.name),
    password: data.password,
  }));

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  email: undefined,
  name: undefined,
  password: undefined,
});

const { strength, score, color } = usePasswordStrength(
  computed(() => state.password || ""),
);

async function loginAdmin(data: Schema) {
  await $fetch("/auth/login", {
    method: "POST",
    body: { email: data.email, password: data.password },
  });
  await dmsApp.runWithContext(() =>
    usePostLoginRedirect(() => firstAccessiblePagePath(siteLayoutTree.value)),
  );
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (isLoading.value || isRegistered.value) return;

  try {
    isLoading.value = true;

    await $authFetch("/api/onboarding/register", {
      method: "POST",
      body: event.data,
    });

    isRegistered.value = true;
    dmsApp.runWithContext(() => setOnboardingComplete());
    await loginAdmin(event.data);

    toast.add({
      title: t("page.onboarding.success.title"),
      color: "success",
    });
  } catch (error: unknown) {
    if (isRegistered.value) {
      // A full reload also clears fatal layout errors from the failed login.
      window.location.replace(LOGIN_PATH);
      return;
    }
    dmsApp.runWithContext(() =>
      useApiError(error, {
        title: "error.500.title",
        description: "error.500.description",
      }),
    );
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl">
    <DmsCard variant="elevated" :padded="false" class="grid gap-4 p-6 sm:p-12">
      <div>
        <h1 class="pb-11 text-xl font-bold sm:text-2xl">
          {{ $t("page.onboarding.create_admin") }}
        </h1>
        <UForm
          :schema="schema"
          :state="state"
          class="space-y-7"
          @submit="onSubmit"
        >
          <UFormField :label="$t('form.name.label')" name="name">
            <UInput v-model="state.name" :loading="isLoading" class="w-full" />
          </UFormField>

          <UFormField :label="$t('form.email.label')" name="email">
            <UInput
              v-model="state.email"
              :loading="isLoading"
              type="email"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="$t('form.password.label')" name="password">
            <UInput
              v-model="state.password"
              :color="color"
              :loading="isLoading"
              :type="isPasswordVisible ? 'text' : 'password'"
              :aria-invalid="score < MIN_VALID_PASSWORD_SCORE"
              aria-describedby="password-strength"
              class="w-full"
            >
              <template #trailing>
                <UButton
                  color="neutral"
                  square
                  size="xs"
                  variant="ghost"
                  :icon="
                    isPasswordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'
                  "
                  :aria-label="
                    isPasswordVisible ? 'Hide password' : 'Show password'
                  "
                  :aria-pressed="isPasswordVisible"
                  aria-controls="password"
                  @click="isPasswordVisible = !isPasswordVisible"
                />
              </template>
            </UInput>
          </UFormField>

          <DmsPasswordStrength
            :color="color"
            :score="score"
            :strength="strength"
          />

          <UButton type="submit" block>
            {{ $t("button.next") }}
          </UButton>

          <div class="text-center text-sm">
            <p>
              {{ $t("page.onboarding.modif_last") }}
              <DmsLink :to="homepage" class="text-primary font-medium">
                {{ $t("button.back") }}
              </DmsLink>
            </p>
          </div>
        </UForm>
      </div>
    </DmsCard>
  </div>
</template>

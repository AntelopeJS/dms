<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";

const MIN_VALID_PASSWORD_SCORE = 4;

const { locale } = useI18n();
const config = useDmsRuntimeConfig();
const homepage = useHomepage();

const route = useDmsRoute();
const queryToken = computed(() => route.query.token as string);
const queryEmail = computed(() => route.query.email as string);
const queryName = computed(() => route.query.name as string | undefined);

if (!queryToken.value) {
  throw createError({
    statusCode: HTTP_BAD_REQUEST,
    statusMessage: INVALID_REQUEST,
    message: "Missing required token parameter",
  });
}

const isLoading = ref(false);
const isPasswordVisible = ref(false);

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: passwordSchema,
});
type Schema = z.output<typeof schema>;
const state = reactive<Partial<Schema>>({
  email: queryEmail.value,
  name: queryName.value,
});

const { strength, score, color } = usePasswordStrength(
  computed(() => state.password || ""),
);

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  try {
    isLoading.value = true;

    await $fetch("/auth/signup", {
      method: "POST",
      body: {
        ...payload.data,
        lang: locale.value,
        token: queryToken.value,
      },
    });

    await usePostLoginRedirect(
      config.public.dms.mustValidateEmail ? "/auth/validate" : homepage,
    );
  } catch (error: unknown) {
    useApiError(error, {
      title: "page.signup.error_title",
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl">
    <DmsCard variant="elevated" :padded="false" class="p-6 sm:p-12">
      <h1 class="pb-11 text-xl font-bold sm:text-2xl">
        {{ $t("page.signup.create_account_title") }}
      </h1>

      <DmsOAuthButtons />

      <UForm
        :schema="schema"
        :state="state"
        class="space-y-7"
        @submit="onSubmit"
      >
        <UFormField :label="$t('form.name.label')" name="name">
          <UInput v-model="state.name" class="w-full" />
        </UFormField>

        <UFormField :label="$t('form.email.label')" name="email">
          <UInput v-model="state.email" type="email" class="w-full" disabled />
        </UFormField>

        <UFormField :label="$t('form.password.label')" name="password">
          <UInput
            v-model="state.password"
            :color="color"
            :type="isPasswordVisible ? 'text' : 'password'"
            :aria-invalid="score < MIN_VALID_PASSWORD_SCORE"
            aria-describedby="password-strength"
            class="w-full"
          >
            <template #trailing>
              <UButton
                :icon="isPasswordVisible ? 'i-ph-eye-slash' : 'i-ph-eye'"
                :aria-label="
                  isPasswordVisible ? 'Hide password' : 'Show password'
                "
                :aria-pressed="isPasswordVisible"
                color="neutral"
                square
                size="xs"
                variant="ghost"
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

        <UButton
          :label="$t('button.continue')"
          :loading="isLoading"
          type="submit"
          block
        />

        <div class="flex justify-center gap-1 text-center text-sm">
          <p>{{ $t("page.auth.already_have") }}</p>
          <DmsLink to="/auth" class="text-primary font-medium">
            {{ $t("button.login") }}
          </DmsLink>
        </div>
      </UForm>
    </DmsCard>
  </div>
</template>

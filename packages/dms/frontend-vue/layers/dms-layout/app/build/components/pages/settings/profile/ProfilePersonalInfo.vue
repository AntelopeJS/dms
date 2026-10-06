<script setup lang="ts">
import { TEXT_LINK_CLASS } from "#dms-ui/app/build/utils/textLink";
import {
  type AvatarFieldOptions,
  useProfileAvatar,
} from "../../../../../composables/settings/profile/useProfileAvatar";
import { SECURITY_PAGE_PATH } from "../../../../../composables/settings/security/useSecurityOverview";
import ProfileAvatar from "./ProfileAvatar.vue";
import DmsFieldError from "#dms-ui/app/components/field-error/FieldError.vue";
import { useFieldErrors } from "#dms-core/app/composables/useFieldErrors";
import { REQUIRED_MESSAGE } from "#dms-core/app/composables/useFormValidation";
import { useUnsavedChanges } from "#dms-ui/app/composables/unsaved-changes/useUnsavedChanges";

interface AvatarValue {
  key: string;
}

interface AvatarFieldComponent {
  options?: AvatarFieldOptions;
}

interface AvatarField {
  component?: AvatarFieldComponent;
}

interface ProfileResponse {
  name?: string;
  email?: string;
  avatar?: AvatarValue | null;
  isValidated?: boolean;
}

interface ProfilePersonalInfoProps {
  endpoint: string;
  avatarField?: AvatarField;
}

const props = defineProps<ProfilePersonalInfoProps>();

const NAME_INPUT_ID = "profile-name";
const AVATAR_BUTTON_ID = "profile-avatar-upload";
const INVALID_AVATAR = "error.invalid_avatar";
const EMAIL_ANCHOR = "#email";

const { t } = useI18n();
const toast = useToast();
const { $authFetch } = useAuthFetch();
const { processApiMessage } = useTranslation();
const { user, refresh: refreshSession } = useCurrentUser();
const { upload, resolveUrl } = useProfileAvatar(
  () => props.avatarField?.component?.options ?? {},
);
// A refused name or picture shows under its field; a failed request is a
// toast.
const fieldErrors = useFieldErrors({
  fields: { name: NAME_INPUT_ID, avatar: AVATAR_BUTTON_ID },
  codes: { [INVALID_AVATAR]: "avatar" },
});

const saved = ref<ProfileResponse>({
  name: user.value?.name,
  email: user.value?.email,
});
const name = ref(saved.value.name ?? "");
const avatar = ref<AvatarValue | null>(null);
const avatarUrl = ref<string | null>(null);
const isUploading = ref(false);
const isSaving = ref(false);
const fileInput = useTemplateRef<HTMLInputElement>("fileInput");

const savedName = computed(() => saved.value.name ?? "");
const isNameChanged = computed(() => name.value.trim() !== savedName.value);
const isAvatarChanged = computed(
  () => (avatar.value?.key ?? null) !== (saved.value.avatar?.key ?? null),
);
const isDirty = computed(() => isNameChanged.value || isAvatarChanged.value);
// Leaving with a new name or picture not saved asks first.
useUnsavedChanges({ dirty: isDirty });
const changes = computed(() =>
  [
    isAvatarChanged.value ? "$page.settings.profile.avatar" : "",
    isNameChanged.value ? "$page.settings.profile.name" : "",
  ].filter(Boolean),
);
const canSave = computed(() => !!name.value.trim() && !isUploading.value);

watch(name, () => fieldErrors.clear("name"));

async function applyProfile(profile: ProfileResponse): Promise<void> {
  fieldErrors.clear();
  saved.value = profile;
  name.value = profile.name ?? "";
  avatar.value = profile.avatar ?? null;
  avatarUrl.value = profile.avatar
    ? await resolveUrl(profile.avatar.key)
    : null;
}

function pickFile(): void {
  fileInput.value?.click();
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  isUploading.value = true;
  fieldErrors.clear("avatar");
  try {
    const result = await upload(file);
    if (result.rejection) {
      await fieldErrors.setError(
        "avatar",
        t(`page.settings.profile.avatar_rejected_${result.rejection}`),
      );
      return;
    }
    avatar.value = { key: result.key! };
    avatarUrl.value = URL.createObjectURL(file);
  } catch {
    toast.add({
      title: t("page.settings.profile.avatar_error"),
      color: "error",
    });
  } finally {
    isUploading.value = false;
  }
}

function removeAvatar(): void {
  fieldErrors.clear("avatar");
  avatar.value = null;
  avatarUrl.value = null;
}

async function discard(): Promise<void> {
  await applyProfile(saved.value);
}

async function save(): Promise<void> {
  if (!name.value.trim()) {
    await fieldErrors.setError("name", processApiMessage(REQUIRED_MESSAGE));
    return;
  }
  if (!canSave.value) return;
  isSaving.value = true;
  try {
    const profile = await $authFetch<ProfileResponse>(props.endpoint, {
      method: "POST",
      body: { name: name.value.trim(), avatar: avatar.value },
    });
    await applyProfile(profile);
    toast.add({ title: t("page.settings.profile.saved"), color: "success" });
    await refreshSession();
  } catch (error) {
    await fieldErrors.handleApiError(error, {
      toastTitle: "page.settings.profile.save_error",
    });
  } finally {
    isSaving.value = false;
  }
}

// The verification state comes with the profile, fetched after mount: a
// skeleton holds the badge's place until then.
const isProfileLoaded = ref(false);

onMounted(async () => {
  try {
    await applyProfile(await $authFetch<ProfileResponse>(props.endpoint));
  } finally {
    isProfileLoaded.value = true;
  }
});
</script>

<template>
  <div>
    <DmsCard
      as="form"
      :padded="false"
      class="overflow-clip"
      @submit.prevent="save"
    >
      <DmsFieldRow
        layout="form"
        label="$page.settings.profile.avatar"
        description="$page.settings.profile.avatar_description"
      >
        <!-- Wraps: the hint and buttons drop under the avatar when the
             control column is narrow (phones, the lg settings column). -->
        <div class="flex min-w-0 flex-wrap items-center gap-4">
          <ProfileAvatar
            :name="name || savedName"
            :src="avatarUrl"
            :loading="isUploading"
            @edit="pickFile"
          />
          <div class="grid min-w-0 flex-1 basis-40 gap-1.5">
            <div class="flex flex-wrap gap-1.5">
              <UButton
                :id="AVATAR_BUTTON_ID"
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-ph-upload-simple"
                :loading="isUploading"
                :label="t('page.settings.profile.avatar_upload')"
                v-bind="fieldErrors.aria('avatar')"
                @click="pickFile"
              />
              <UButton
                v-if="avatar"
                color="error"
                variant="ghost"
                size="sm"
                icon="i-ph-trash"
                :label="t('page.settings.profile.avatar_remove')"
                @click="removeAvatar"
              />
            </div>
            <span class="text-muted text-xs">
              {{ t("page.settings.profile.avatar_hint") }}
            </span>
            <DmsFieldError
              :id="fieldErrors.errorId('avatar')"
              :message="fieldErrors.errors.avatar"
            />
          </div>
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            :accept="
              props.avatarField?.component?.options?.constraints?.allowedMimetypes?.join(
                ',',
              ) || 'image/*'
            "
            @change="onFileChange"
          />
        </div>
      </DmsFieldRow>

      <DmsFieldRow
        layout="form"
        description="$page.settings.profile.name_description"
        required
      >
        <template #label>
          <label :for="NAME_INPUT_ID">
            {{ t("page.settings.profile.name") }}
          </label>
        </template>
        <UInput
          :id="NAME_INPUT_ID"
          v-model="name"
          autocomplete="name"
          class="w-full max-w-[480px]"
          :color="fieldErrors.errors.name ? 'error' : undefined"
          :highlight="!!fieldErrors.errors.name"
          v-bind="fieldErrors.aria('name')"
        />
        <DmsFieldError
          :id="fieldErrors.errorId('name')"
          :message="fieldErrors.errors.name"
        />
        <span v-if="isNameChanged && savedName" class="text-muted text-xs">
          {{ t("page.settings.profile.name_was", { name: savedName }) }}
        </span>
      </DmsFieldRow>

      <DmsFieldRow
        layout="form"
        label="$page.settings.profile.email"
        description="$page.settings.profile.email_description"
      >
        <!-- min-w-0: the address truncates instead of its full width
             pushing the control column past the card. -->
        <div class="flex max-w-[680px] min-w-0 flex-wrap items-center gap-2.5">
          <div
            class="text-toned border-default flex h-8 min-w-[min(220px,100%)] flex-auto items-center gap-2 rounded-md border bg-(--dms-bg-muted) px-2.5 text-sm"
            role="textbox"
            aria-readonly="true"
            :aria-label="t('page.settings.profile.email_readonly')"
          >
            <UIcon
              name="i-ph-envelope-simple"
              class="text-dimmed size-4 shrink-0"
            />
            <span class="min-w-0 flex-1 truncate" :title="saved.email">
              {{ saved.email }}
            </span>
            <USkeleton
              v-if="!isProfileLoaded"
              aria-hidden="true"
              class="h-5 w-[74px] shrink-0 rounded-md"
            />
            <UBadge
              v-else-if="saved.isValidated !== undefined"
              :color="saved.isValidated ? 'success' : 'warning'"
              variant="subtle"
              size="sm"
              class="shrink-0"
              :icon="saved.isValidated ? 'i-ph-seal-check' : 'i-ph-warning'"
              :label="
                saved.isValidated
                  ? t('page.settings.security.verified')
                  : t('page.settings.security.not_verified')
              "
            />
          </div>
          <DmsLink
            :to="`${SECURITY_PAGE_PATH}${EMAIL_ANCHOR}`"
            :class="[
              TEXT_LINK_CLASS,
              'inline-flex items-center gap-1.5 text-[12.5px]',
            ]"
          >
            {{ t("page.settings.profile.email_change_link") }}
            <UIcon name="i-ph-arrow-right" class="size-3.5" />
          </DmsLink>
        </div>
        <span
          class="text-muted inline-flex min-w-0 items-center gap-1.5 text-xs"
        >
          <UIcon
            name="i-ph-lock-simple"
            class="text-dimmed size-3.5 shrink-0"
          />
          {{ t("page.settings.profile.credentials_hint") }}
        </span>
      </DmsFieldRow>
    </DmsCard>

    <DmsSaveBar
      :dirty="isDirty"
      :saving="isSaving"
      :changes="changes"
      @discard="discard"
      @save="save"
    />
  </div>
</template>

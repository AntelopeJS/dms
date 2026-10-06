<script setup lang="ts">
import { TILE_ROW_INTERACTIVE_CLASS } from "#dms-ui/app/build/utils/tileRow";
import type { KeyValueItem } from "#dms-ui/app/components/key-value-list/KeyValueList.vue";
import StageCard from "../../../../../../dms-layout/app/build/components/layout/StageCard.vue";
import type {
  OnboardingAdministrator,
  OnboardingPlatform,
} from "../../../composables/onboarding/steps";
import StepMeta from "../StepMeta.vue";

interface ReadyStepProps {
  platform: OnboardingPlatform;
  administrator: OnboardingAdministrator;
}

interface NextAction {
  id: string;
  icon: string;
  titleKey: string;
  descriptionKey: string;
  to: string;
  isExternal?: boolean;
}

const props = defineProps<ReadyStepProps>();

const LOGIN_PATH = "/auth";

const NEXT_ACTIONS: NextAction[] = [
  {
    id: "members",
    icon: "i-ph-user-plus",
    titleKey: "page.onboarding.ready.invite_title",
    descriptionKey: "page.onboarding.ready.invite_description",
    to: "/settings/workspace/members",
  },
  {
    id: "security",
    icon: "i-ph-shield-check",
    titleKey: "page.onboarding.ready.security_title",
    descriptionKey: "page.onboarding.ready.security_description",
    to: "/settings/user/security",
  },
  {
    id: "modules",
    icon: "i-ph-squares-four",
    titleKey: "page.onboarding.ready.modules_title",
    descriptionKey: "page.onboarding.ready.modules_description",
    to: "/modules",
  },
  {
    id: "documentation",
    icon: "i-ph-book-open",
    titleKey: "page.onboarding.ready.docs_title",
    descriptionKey: "page.onboarding.ready.docs_description",
    to: "https://antelopejs.com/docs",
    isExternal: true,
  },
];

const ACTION_CLASS = `${TILE_ROW_INTERACTIVE_CLASS} w-full py-[11px] text-start text-[13px]`;

const EXTERNAL_LINK_ATTRIBUTES = {
  target: "_blank",
  rel: "noopener noreferrer",
};

const { t } = useI18n();
const { uniqueLocales } = useUniqueLocales();
const { siteLayoutTree } = useSiteLayout();
const dmsApp = useDmsApp();

const isOpening = ref(false);

const languageName = computed(
  () =>
    uniqueLocales.value.find((lang) => lang.code === props.platform.language)
      ?.name ?? props.platform.language,
);

const recapItems = computed<KeyValueItem[]>(() => [
  {
    id: "platform",
    label: t("page.onboarding.ready.recap_platform"),
    value: props.platform.name,
  },
  {
    id: "language",
    label: t("page.onboarding.ready.recap_language"),
    value: languageName.value,
  },
]);

function actionAttributes(action: NextAction): Record<string, unknown> {
  if (action.isExternal) {
    return { href: action.to, ...EXTERNAL_LINK_ATTRIBUTES };
  }
  return { type: "button", disabled: isOpening.value };
}

// The session is refreshed on the way out, not before: the owner stays on
// this page, and every exit first loads their permissions and language.
async function open(destination?: string) {
  if (isOpening.value) return;
  isOpening.value = true;
  try {
    await dmsApp.runWithContext(() =>
      usePostLoginRedirect(
        destination ?? (() => firstAccessiblePagePath(siteLayoutTree.value)),
      ),
    );
  } catch {
    // A full reload also clears fatal layout errors from the failed refresh.
    window.location.replace(LOGIN_PATH);
  }
}
</script>

<template>
  <StageCard
    width="wide"
    :title="
      $t('page.onboarding.ready.title', { platform: props.platform.name })
    "
  >
    <template #eyebrow>
      <div
        class="bg-success/10 text-success mb-4 grid size-[52px] place-items-center rounded-full shadow-[0_0_0_8px_color-mix(in_srgb,var(--ui-success)_6%,transparent)]"
      >
        <UIcon name="i-ph-check-bold" class="size-[26px]" />
      </div>
      <StepMeta :step="3" :label="$t('page.onboarding.steps.ready')" />
    </template>

    <template #description>
      <i18n-t
        keypath="page.onboarding.ready.description"
        tag="span"
        scope="global"
      >
        <template #name>
          <b>{{ props.administrator.name }}</b>
        </template>
      </i18n-t>
    </template>

    <ul class="mt-[22px] grid gap-2">
      <li v-for="action in NEXT_ACTIONS" :key="action.id">
        <component
          :is="action.isExternal ? 'a' : 'button'"
          v-bind="actionAttributes(action)"
          :class="ACTION_CLASS"
          @click="action.isExternal || open(action.to)"
        >
          <DmsIconWell
            :icon="action.icon"
            :tone="action.isExternal ? 'neutral' : 'accent'"
            size="sm"
          />
          <span class="min-w-0 flex-1">
            <b class="text-highlighted block font-semibold">
              {{ $t(action.titleKey) }}
            </b>
            <small class="text-muted block text-xs">
              {{ $t(action.descriptionKey) }}
            </small>
          </span>
          <UIcon
            :name="
              action.isExternal ? 'i-ph-arrow-square-out' : 'i-ph-arrow-right'
            "
            class="text-dimmed size-4"
          />
        </component>
      </li>
    </ul>

    <UButton
      :label="$t('page.onboarding.ready.submit')"
      :loading="isOpening"
      trailing-icon="i-ph-arrow-right"
      :ui="{ trailingIcon: 'ms-0' }"
      size="lg"
      class="mt-[22px] justify-center"
      block
      @click="open()"
    />

    <DmsKeyValueList class="mt-[18px]" :items="recapItems" />
  </StageCard>
</template>

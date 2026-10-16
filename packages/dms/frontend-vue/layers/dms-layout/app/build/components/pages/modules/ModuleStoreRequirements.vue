<script setup lang="ts">
import DmsCopyButton from "#dms-ui/app/components/copy/CopyButton.vue";
import type { StoreListingEntry } from "../../../../types/module-store";

interface ModuleStoreRequirementsProps {
  /** The store module whose requirements the tile spells out. */
  entry: StoreListingEntry;
}

const props = defineProps<ModuleStoreRequirementsProps>();
const { t } = useI18n();

const LIST_SEPARATOR = ", ";

const requirement = computed(() => props.entry.frontendRequirement);
const missingInterfaces = computed(() =>
  props.entry.missingInterfaces
    .map((missing) => missing.interfacePackage)
    .join(LIST_SEPARATOR),
);
const dependents = computed(() => props.entry.dependents.join(LIST_SEPARATOR));
</script>

<template>
  <!-- The release needs another dms-frontend: what to run, what it breaks.
       The store never moves dms-frontend itself. -->
  <div
    v-if="requirement"
    class="flex flex-col gap-1.5 rounded-[8px] bg-(--ui-warning)/8 px-2.5 py-1.5 text-xs text-(--ui-warning)"
  >
    <p>
      {{
        t("modules.store.frontend_requirement.needs", {
          range: requirement.range,
          running: requirement.running,
        })
      }}
    </p>
    <template v-if="requirement.target">
      <p v-if="requirement.command" class="text-toned">
        {{
          t("modules.store.frontend_requirement.run", {
            target: requirement.target,
          })
        }}
      </p>
      <div
        v-if="requirement.command"
        class="text-highlighted flex min-w-0 items-center gap-1 rounded-[6px] border border-(--ui-border) bg-(--dms-bg-muted) ps-2 font-mono text-[11px]"
      >
        <code class="min-w-0 flex-1 truncate" :title="requirement.command">
          {{ requirement.command }}
        </code>
        <DmsCopyButton :value="requirement.command" />
      </div>
      <template v-if="requirement.breaks.length > 0">
        <p>
          {{
            t("modules.store.frontend_requirement.breaks", {
              target: requirement.target,
            })
          }}
        </p>
        <ul class="text-toned flex flex-col gap-0.5">
          <li
            v-for="layer in requirement.breaks"
            :key="layer.name"
            class="flex min-w-0 items-baseline gap-1.5"
          >
            <span class="truncate font-mono">{{ layer.name }}</span>
            <span class="text-dimmed shrink-0">
              {{
                t("modules.store.frontend_requirement.supports", {
                  range: layer.range,
                })
              }}
            </span>
          </li>
        </ul>
      </template>
    </template>
    <p v-else class="text-toned">
      {{ t("modules.store.frontend_requirement.no_target") }}
    </p>
  </div>

  <p
    v-if="missingInterfaces"
    class="text-toned truncate text-xs"
    :title="missingInterfaces"
  >
    {{ t("modules.store.requires", { interfaces: missingInterfaces }) }}
  </p>

  <p v-if="dependents" class="text-xs text-(--ui-warning)">
    {{ t("modules.store.used_by", { modules: dependents }) }}
  </p>
</template>

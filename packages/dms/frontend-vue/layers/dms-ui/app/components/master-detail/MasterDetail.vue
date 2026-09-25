<script setup lang="ts">
// Two-pane master/detail layout (design .md-split): a selectable list on the
// left (380px) and a detail panel on the right. The list is driven by `items`
// + v-model; the detail is rendered by the default slot, which receives the
// currently selected value.
interface MdItem {
  value: string | number;
  label: string;
  sublabel?: string;
  icon?: string;
}

defineProps<{
  items: MdItem[];
  listLabel?: string;
}>();

const selected = defineModel<string | number>();

defineSlots<{
  default?: (props: { selected: string | number | undefined }) => unknown;
}>();
</script>

<template>
  <div class="grid items-start gap-5 lg:grid-cols-[380px_1fr]">
    <!-- List pane -->
    <div class="dms-card p-2">
      <p
        v-if="listLabel"
        class="text-dimmed px-2.5 pt-2.5 pb-1 font-mono text-[10px] tracking-widest uppercase"
      >
        {{ listLabel }}
      </p>
      <ul class="flex flex-col gap-1.5">
        <li v-for="item in items" :key="item.value">
          <button
            type="button"
            class="flex w-full items-start gap-3 rounded-md border border-transparent px-3.5 py-3 text-left transition-colors"
            :class="
              selected === item.value
                ? 'border-primary bg-primary/10'
                : 'hover:bg-elevated'
            "
            @click="selected = item.value"
          >
            <span
              v-if="item.icon"
              class="grid size-[26px] shrink-0 place-items-center"
              :class="selected === item.value ? 'text-primary' : 'text-toned'"
            >
              <UIcon
                :name="item.icon"
                class="size-[18px]"
                :aria-hidden="true"
              />
            </span>
            <span class="min-w-0">
              <span class="text-highlighted block text-sm font-semibold">
                {{ item.label }}
              </span>
              <span
                v-if="item.sublabel"
                class="text-muted mt-0.5 block truncate text-xs"
              >
                {{ item.sublabel }}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Detail pane -->
    <div class="dms-card overflow-hidden">
      <slot :selected="selected" />
    </div>
  </div>
</template>

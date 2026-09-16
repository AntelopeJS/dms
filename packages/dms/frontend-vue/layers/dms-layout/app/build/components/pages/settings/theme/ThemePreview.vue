<script setup lang="ts">
interface Props {
  mode: string;
}

const props = defineProps<Props>();

// Mini-app illustration palettes (design appearance.html preview()).
const L = { bg: "#ffffff", side: "#f1f1f3", bar: "#d7d8de", barD: "#b9bbc4" };
const D = { bg: "#15151b", side: "#0a0b12", bar: "#2a2a30", barD: "#3a3b46" };

interface PreviewVariant {
  frame: string;
  side: typeof L;
  main: typeof L;
}

const DEFAULT_VARIANT: PreviewVariant = { frame: L.side, side: L, main: D };

const MODE_VARIANTS: Record<string, PreviewVariant> = {
  light: { frame: L.side, side: L, main: L },
  dark: { frame: D.side, side: D, main: D },
  system: DEFAULT_VARIANT,
};

const variant = computed(() => MODE_VARIANTS[props.mode] ?? DEFAULT_VARIANT);
</script>

<template>
  <div
    class="flex gap-2 overflow-hidden p-2.5"
    :style="{ background: variant.frame }"
  >
    <!-- Sidebar -->
    <div
      class="flex w-[36%] flex-col gap-1.5 rounded-[7px] p-2"
      :style="{ background: variant.side.side }"
    >
      <div class="mb-0.5 flex gap-[3px]">
        <span class="size-[5px] rounded-full bg-[#f87171]" />
        <span class="size-[5px] rounded-full bg-[#fbbf24]" />
        <span class="size-[5px] rounded-full bg-[#34d399]" />
      </div>
      <div
        class="h-1.5 w-4/5 rounded-[3px]"
        :style="{ background: variant.side.bar }"
      />
      <div
        class="h-1.5 w-3/5 rounded-[3px]"
        :style="{ background: variant.side.bar }"
      />
      <div class="bg-primary h-1.5 w-1/2 rounded-[3px]" />
    </div>

    <!-- Main -->
    <div
      class="flex flex-1 flex-col gap-[7px] rounded-[7px] p-2"
      :style="{ background: variant.main.bg }"
    >
      <div
        class="h-1.5 w-2/5 rounded-[3px]"
        :style="{ background: variant.main.barD }"
      />
      <div
        class="h-1.5 w-[90%] rounded-[3px]"
        :style="{ background: variant.main.bar }"
      />
      <div
        class="h-1.5 w-3/4 rounded-[3px]"
        :style="{ background: variant.main.bar }"
      />
      <div
        class="h-1.5 w-[85%] rounded-[3px]"
        :style="{ background: variant.main.bar }"
      />
    </div>
  </div>
</template>

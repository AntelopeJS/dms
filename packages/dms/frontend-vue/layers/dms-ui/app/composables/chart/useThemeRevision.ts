import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { clearChartColorCache } from "./useChartTheme";

interface ColorModeLike {
  preference?: string;
  value?: string;
  $subscribe?: (cb: () => void) => () => void;
}

type ColorModeFactory = () => ColorModeLike;

const THEME_OBSERVED_ATTRIBUTES = ["class", "data-theme", "style"];

function getColorModeFactory(): ColorModeFactory | undefined {
  const fn = (globalThis as unknown as { useColorMode?: ColorModeFactory })
    .useColorMode;
  return typeof fn === "function" ? fn : undefined;
}

function trySubscribeColorMode(bump: () => void) {
  const factory = getColorModeFactory();
  if (!factory) return;
  const mode = factory();
  mode?.$subscribe?.(bump);
}

function createThemeObserver(bump: () => void): MutationObserver {
  const observer = new MutationObserver(bump);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: THEME_OBSERVED_ATTRIBUTES,
  });
  return observer;
}

export function useThemeRevision(): Ref<number> {
  const revision = ref(0);

  if (typeof window === "undefined") return revision;

  let observer: MutationObserver | null = null;

  const bump = () => {
    clearChartColorCache();
    revision.value += 1;
  };

  onMounted(() => {
    observer = createThemeObserver(bump);
    trySubscribeColorMode(bump);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return revision;
}

import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { clearChartColorCache } from "./useChartTheme";

const THEME_OBSERVED_ATTRIBUTES = ["class", "data-theme", "style"];

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
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return revision;
}

/**
 * Feeds the playground's feature index to the command palette: Ctrl K (⌘K)
 * then "redirectTo" or "header availability" lists the features that match,
 * each opening its demo page. Read once from the feature index route.
 *
 * Client-only: the source carries a `groups` function, which the SSR payload
 * would drop.
 */
import { ref } from "vue";

const FEATURES_URL = "/api/playground-features";
const SOURCE_ID = "playground:features";
// After the navigation source (40), before the session one (50).
const SOURCE_ORDER = 45;

interface FeatureRow {
  _id: string;
  feature: string;
  api: string;
  area: string;
  demo: string;
}

interface FeatureList {
  results: FeatureRow[];
}

export default defineDmsPlugin(() => {
  const features = ref<FeatureRow[]>([]);
  void $fetch<FeatureList>(FEATURES_URL)
    .then((list) => {
      features.value = list.results;
    })
    .catch(() => {
      features.value = [];
    });

  registerCommandPaletteSource({
    id: SOURCE_ID,
    order: SOURCE_ORDER,
    groups: () => [
      {
        id: `${SOURCE_ID}:index`,
        label: "Playground features",
        items: features.value.map((row) => ({
          label: row.feature,
          suffix: row.api,
          icon: "i-ph-list-checks",
          to: row.demo,
          [COMMAND_PALETTE_SEARCH_TEXT_KEY]: `${row.area} ${row.api}`,
        })),
      },
    ],
  });
});

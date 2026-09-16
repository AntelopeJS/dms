import { createApp, defineComponent, h, ref } from "vue";
import ChartCard from "../../layers/dms-ui/app/components/chart/ChartCard.vue";
import Chart from "../../layers/dms-ui/app/components/chart/Chart.vue";
import ApexChartHost from "../../layers/dms-ui/app/components/chart/ApexChartHost.vue";
import type { ValuePrecision } from "../../layers/dms-ui/app/composables/chart/types";

const locale = ref("fr-FR");
const precision = ref<ValuePrecision | undefined>("native");
const revision = ref(0);
const AMOUNT = 9.391;
const SAMPLE = {
  value: AMOUNT,
  previousValue: 8.125,
  series: [
    {
      name: "Spend",
      data: [
        { x: "01", y: 0 },
        { x: "02", y: AMOUNT },
      ],
    },
  ],
};

Object.assign(globalThis, {
  useI18n: () => ({ locale, t: (key: string) => key }),
  useTranslation: () => ({ processI18n: (text: string) => text }),
  useComponentEvent: () => ({}),
  useWatch: () => ({ state: ref({}) }),
  useAuthFetch: () => ({ $authFetch: async () => SAMPLE }),
});

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});
const Card = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("article", slots.default?.()),
});
function renderControls() {
  return [
    {
      label: locale.value,
      onClick: () => {
        locale.value = locale.value === "fr-FR" ? "en-US" : "fr-FR";
      },
    },
    {
      label: `Précision : ${precision.value}`,
      onClick: () => {
        precision.value = precision.value === "native" ? 3 : "native";
      },
    },
    {
      label: "Valeur par défaut",
      onClick: () => {
        precision.value = undefined;
      },
    },
    {
      label: "Remonter les graphiques",
      onClick: () => {
        revision.value++;
      },
    },
  ].map(({ label, onClick }) => h("button", { onClick }, label));
}

function renderCard(currencyCode: string) {
  return h(
    ChartCard,
    {
      title: currencyCode,
      componentId: currencyCode,
      pageId: "precision",
      fetchUrl: "/fixture",
      valueFormat: "currency",
      currencyCode,
      valuePrecision: precision.value,
    },
    () =>
      h(Chart, {
        key: revision.value,
        type: "line",
        componentId: `${currencyCode}-plot`,
        pageId: "precision",
        height: "200px",
      }),
  );
}

const app = createApp({
  setup: () => () =>
    h("main", [
      h("h1", "DMS · précision des valeurs"),
      h(
        "p",
        "Actual ChartCard, Chart and ApexChartHost with mocked API data. Hover the final point to inspect its tooltip.",
      ),
      h(
        "p",
        "Change precision without remounting to verify axis and tooltip formatters stay active. Remount to compare against initial rendering.",
      ),
      ...renderControls(),
      ...["EUR", "JPY", "KWD"].map(renderCard),
    ]),
});
for (const name of ["DmsClientOnly", "USkeleton", "DmsTrendBadge"])
  app.component(name, Slot);
app.component("DmsCard", Card);
app.component("DmsApexChartHost", ApexChartHost);
app.config.globalProperties.$t = (key: string) => key;
app.mount("#app");

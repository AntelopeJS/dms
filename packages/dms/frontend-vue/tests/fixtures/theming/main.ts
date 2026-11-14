import { createInertiaApp } from "@inertiajs/vue3";
import { createApp, defineComponent, h, type ComputedOptions } from "vue";
import ui from "@nuxt/ui/vue-plugin";
import App from "./app/app.vue";
import defaults from "./base/app/app.config";
import consumer from "./consumer/app/app.config";
import { defu } from "defu";

declare const __THEME_DEFAULT__: boolean;
declare const __THEME_CSS_LAST__: boolean;

const styles = [
  () => import("../../../layers/dms-layout/app/assets/css/main.css"),
];
if (!__THEME_DEFAULT__) styles.unshift(() => import("./consumer.css"));
if (__THEME_CSS_LAST__) styles.reverse();
for (const load of styles) await load();
const config = __THEME_DEFAULT__ ? defaults : defu(consumer, defaults);
const computedOptions: ComputedOptions = {};
const ThemingPage = defineComponent({
  computed: computedOptions,
  render: () => h(App),
});

createInertiaApp({
  page: {
    component: "theming",
    props: { config, errors: {} },
    url: "/",
    version: "fixture",
    clearHistory: false,
    encryptHistory: false,
    rescuedProps: [],
    flash: {},
    rememberedState: {},
  },
  resolve: () => ThemingPage,
  setup({ el, App: InertiaApp, props, plugin }) {
    createApp({ render: () => h(InertiaApp, props) })
      .use(plugin)
      .use(ui)
      .mount(el);
  },
});

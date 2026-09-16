import type { Composer } from "vue-i18n";

declare module "@vue/runtime-core" {
  interface ComponentCustomProperties {
    $t: Composer["t"];
    $rt: Composer["rt"];
    $n: Composer["n"];
    $d: Composer["d"];
    $tm: Composer["tm"];
    $te: Composer["te"];
    $i18n: Composer;
  }
}

export {};

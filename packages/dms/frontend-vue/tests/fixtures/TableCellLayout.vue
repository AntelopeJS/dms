<script setup lang="ts">
import { h, ref } from "vue";
import type { CellContext } from "@tanstack/vue-table";
import Table, {
  type Data,
  type TableColumn,
} from "../../layers/dms-ui/app/build/components/table/Table.vue";
import Badge from "@nuxt/ui/components/Badge.vue";

interface LayoutRow extends Data {
  _id: string;
  value: string;
}

const NARROW_WIDTH = "440px";
const WIDE_WIDTH = "1000px";
const isNarrow = ref(true);
const text =
  "Une description longue qui doit rester lisible lorsque la colonne devient étroite.";
const data: LayoutRow[] = [
  { _id: "plain", value: "Texte simple" },
  { _id: "hint", value: "Aucun accès" },
  { _id: "long", value: text },
  { _id: "email", value: "invitation-tres-longue-sans-espace@exemple.fr" },
];
const renderCell = ({ row }: CellContext<LayoutRow, unknown>) => {
  if (row.original._id !== "hint") return row.original.value;
  return h("div", { class: "flex flex-col items-start gap-1" }, [
    h(
      Badge,
      { variant: "outline", class: "whitespace-nowrap shrink-0" },
      () => row.original.value,
    ),
    h(
      "span",
      { class: "text-muted text-xs", "data-hint": "" },
      "Par défaut à l’arrivée · resto-lucca",
    ),
  ]);
};
const columns: TableColumn<LayoutRow>[] = [
  { id: "before", header: "Défaut conservé", cell: renderCell },
  { id: "after", header: "cellWrap: true", cell: renderCell, cellWrap: true },
];
</script>

<template>
  <UApp>
    <main class="p-8">
      <h1 class="mb-4 text-2xl font-semibold">
        Cellules Table DMS — rendu réel
      </h1>
      <button
        class="mb-6 rounded border px-4 py-2"
        @click="isNarrow = !isNarrow"
      >
        {{ isNarrow ? "Afficher large" : "Afficher étroit" }}
      </button>
      <div :style="{ width: isNarrow ? NARROW_WIDTH : WIDE_WIDTH }">
        <Table
          caption="Texte, badge + indication, texte long"
          :data="data"
          :columns="columns"
        />
      </div>
    </main>
  </UApp>
</template>

<style>
@import "../../layers/dms-layout/app/assets/css/main.css";
@source "../../layers/dms-ui/app/build";
</style>

<script setup lang="ts">
/**
 * Detail component of the "Expandable rows" demo, named by the backend
 * `expandable.component` option. With `lazyLoad`, the TableView hands it the
 * order as `get` answers it when the row opens: its lines and timeline are
 * neither grid columns nor listed fields.
 */

interface OrderLine {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

interface OrderEvent {
  icon: string;
  tone: string;
  title: string;
  at: string;
}

interface OrderLinesDetailProps {
  /** The order, as `get` answered it when the row opened. */
  row: Record<string, unknown>;
  /** Id of the row. */
  rowId: string;
}

const props = defineProps<OrderLinesDetailProps>();

const { locale } = useI18n();

const lines = computed(
  () => (props.row.lines as OrderLine[] | undefined) ?? [],
);
const events = computed(
  () => (props.row.events as OrderEvent[] | undefined) ?? [],
);

const money = computed(
  () =>
    new Intl.NumberFormat(locale.value, { style: "currency", currency: "EUR" }),
);
const time = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
);

const total = computed(() =>
  lines.value.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
);
</script>

<template>
  <div class="grid gap-6 md:grid-cols-2">
    <section class="grid min-w-0 content-start gap-2">
      <DmsEyebrow :label="`Lines · ${lines.length}`" />
      <table class="w-full text-[12.5px]">
        <caption class="sr-only">
          Lines of the order
        </caption>
        <tbody>
          <tr
            v-for="line in lines"
            :key="line.sku"
            class="border-muted border-t first:border-t-0"
          >
            <td class="py-1.5 pe-3">
              <span class="text-highlighted block">{{ line.name }}</span>
              <span class="text-dimmed font-mono text-[11px]">
                {{ line.sku }}
              </span>
            </td>
            <td class="text-muted py-1.5 pe-3 font-mono whitespace-nowrap">
              × {{ line.quantity }}
            </td>
            <td
              class="py-1.5 text-right font-mono whitespace-nowrap tabular-nums"
            >
              {{ money.format(line.quantity * line.unitPrice) }}
            </td>
          </tr>
          <tr class="border-default border-t">
            <td colspan="2" class="text-muted py-1.5 pe-3">Total</td>
            <td
              class="text-highlighted py-1.5 text-right font-mono font-semibold tabular-nums"
            >
              {{ money.format(total) }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <section class="grid min-w-0 content-start gap-2">
      <DmsEyebrow label="Timeline" />
      <div class="dms-card overflow-hidden">
        <DmsActivityItem
          v-for="event in events"
          :key="event.title"
          :icon="event.icon"
          :icon-color="event.tone"
          :title="event.title"
          :trailing="time.format(new Date(event.at))"
          :interactive="false"
        />
      </div>
    </section>
  </div>
</template>

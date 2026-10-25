<script setup lang="ts">
import { computed } from "vue";
import { useMatrixContext } from "../../composables/matrix/useMatrix";

/**
 * The columns menu: each column shown or hidden, moved up or down, and a
 * reset; the choices are remembered on this device.
 */
const matrix = useMatrixContext();
const { t } = useI18n();

const columns = computed(() => matrix.columns.columns.value);
const lastIndex = computed(() => columns.value.length - 1);
</script>

<template>
  <UPopover :content="{ align: 'end' }">
    <UButton
      icon="i-ph-columns"
      size="sm"
      color="neutral"
      variant="ghost"
      :label="t('dms.matrix.columns')"
    />
    <template #content>
      <div class="w-72 p-1.5">
        <ul
          class="max-h-80 overflow-auto"
          :aria-label="t('dms.matrix.columns')"
        >
          <li
            v-for="(column, index) in columns"
            :key="column.id"
            class="hover:bg-elevated flex items-center gap-2 rounded-md px-2 py-1"
          >
            <UCheckbox
              :model-value="!matrix.columns.isHidden(column)"
              :label="matrix.text(column.label)"
              class="min-w-0 flex-1"
              @update:model-value="matrix.columns.toggle(column.id)"
            />
            <UButton
              icon="i-ph-caret-up"
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="index === 0"
              :aria-label="
                t('dms.matrix.move_up', { column: matrix.text(column.label) })
              "
              @click="matrix.columns.move(column.id, -1)"
            />
            <UButton
              icon="i-ph-caret-down"
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="index === lastIndex"
              :aria-label="
                t('dms.matrix.move_down', { column: matrix.text(column.label) })
              "
              @click="matrix.columns.move(column.id, 1)"
            />
          </li>
        </ul>
        <div class="border-default mt-1 border-t pt-1">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            block
            :label="t('dms.matrix.columns_reset')"
            @click="matrix.columns.reset()"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type { MockupPins } from "../../composables/block-preview/useMockupPins";
import MockupPinCard from "./MockupPinCard.vue";

defineProps<{
  /** The tray holds the notes whose block or page was removed: each is dragged onto the page to pin it there again, or opened to be edited, resolved or deleted. */
  pins: MockupPins;
}>();

const { t } = useI18n();
</script>

<template>
  <section
    v-if="pins.tray.value.length"
    class="border-default bg-default/95 w-64 space-y-2 rounded-lg border p-2 shadow-md backdrop-blur"
    :aria-label="t('dms.mockup.pin_tray')"
    data-dms-mockup-pin-tray
  >
    <header class="px-1">
      <h2 class="text-highlighted text-xs font-semibold">
        {{ t("dms.mockup.pin_tray") }} · {{ pins.tray.value.length }}
      </h2>
      <p class="text-muted text-xs">{{ t("dms.mockup.pin_tray_hint") }}</p>
    </header>
    <ul class="max-h-64 space-y-1 overflow-y-auto">
      <li v-for="entry in pins.tray.value" :key="entry.note.id">
        <button
          type="button"
          class="hover:bg-elevated flex w-full touch-none items-center gap-2 rounded-md px-1 py-1 text-start text-xs select-none"
          :class="
            pins.canChange(entry.note)
              ? 'cursor-grab active:cursor-grabbing'
              : 'cursor-pointer'
          "
          :aria-expanded="pins.openId.value === entry.note.id"
          :data-dms-mockup-pin="entry.note.id"
          :data-status="entry.note.status"
          @pointerdown="
            pins.canChange(entry.note) && pins.press(entry.note.id, $event)
          "
          @click="!pins.canChange(entry.note) && pins.toggleCard(entry.note.id)"
          @keydown.enter.prevent="pins.toggleCard(entry.note.id)"
          @keydown.space.prevent="pins.toggleCard(entry.note.id)"
        >
          <span
            class="bg-primary text-inverted flex size-5 shrink-0 items-center justify-center rounded-full rounded-bl-none text-[10px] font-semibold"
          >
            {{ entry.number }}
          </span>
          <span class="text-default truncate">{{ entry.note.text }}</span>
        </button>
        <MockupPinCard
          v-if="pins.openId.value === entry.note.id"
          class="mt-1 w-full shadow-none"
          :note="entry.note"
          :number="entry.number"
          :can-change="pins.canChange(entry.note)"
          :can-remove-reply="pins.canRemoveReply"
          :unsaved="pins.unsaved"
          @save="(text) => pins.setText(entry.note.id, text)"
          @status="(status) => pins.setStatus(entry.note.id, status)"
          @remove="pins.remove(entry.note.id)"
          @reply="(text) => pins.reply(entry.note.id, text)"
          @remove-reply="(replyId) => pins.removeReply(entry.note.id, replyId)"
          @close="pins.toggleCard(entry.note.id)"
        />
      </li>
    </ul>
  </section>
</template>

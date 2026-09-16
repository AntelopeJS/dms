export const TAB_SHIFT_LETTER_METADATA: ShortcutMetadata = {
  key: ["$keyboard.shift", "$keyboard.letter_placeholder"],
  descriptionKey: "$dms.shortcuts.tab.shift_letter.description",
  component: "$dms.components.tab",
  condition: {
    descriptionKey: "$dms.shortcuts.tab.shift_letter.condition",
  },
};

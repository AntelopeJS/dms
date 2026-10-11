// The keys of a row opened from the table (see `listenRowSteps` and
// `listenRowPanelClose`): listed in the shortcuts help, handled by the panel,
// drawer or modal while it is open.

const ROW_OPEN_CONDITION = {
  descriptionKey: "$dms.shortcuts.tableview.row_open.condition",
};

export const TABLE_VIEW_J_METADATA: ShortcutMetadata = {
  key: ["j"],
  descriptionKey: "$dms.shortcuts.tableview.j.description",
  component: "$dms.components.tableview",
  condition: ROW_OPEN_CONDITION,
};

export const TABLE_VIEW_K_METADATA: ShortcutMetadata = {
  key: ["k"],
  descriptionKey: "$dms.shortcuts.tableview.k.description",
  component: "$dms.components.tableview",
  condition: ROW_OPEN_CONDITION,
};

export const TABLE_VIEW_PANEL_ESCAPE_METADATA: ShortcutMetadata = {
  key: ["$keyboard.escape"],
  descriptionKey: "$dms.shortcuts.tableview.panel_escape.description",
  component: "$dms.components.tableview",
  condition: {
    descriptionKey: "$dms.shortcuts.tableview.panel_escape.condition",
  },
};

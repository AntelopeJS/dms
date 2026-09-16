export interface ShortcutCondition {
  descriptionKey: string;
  check?: string;
}

export interface ShortcutMetadata {
  key: string[];
  descriptionKey: string;
  component: string;
  condition?: ShortcutCondition;
}

export interface ComponentShortcuts {
  component: string;
  shortcuts: ShortcutMetadata[];
}

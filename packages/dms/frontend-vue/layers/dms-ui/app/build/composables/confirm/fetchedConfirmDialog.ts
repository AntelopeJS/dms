import type {
  ConfirmDialog,
  ConfirmDialogField,
  ConfirmDialogSecondaryAction,
} from "#dms-core/app/types/confirm-dialog";

/** A component name as the registry compares it: case, a leading `lazy` and every non-alphanumeric character dropped. */
function registryKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^lazy/, "");
}

const NUMBER_KEYS = [
  "placeholder",
  "min",
  "max",
  "step",
  "clamp",
  "currency",
  "suffix",
  "width",
];
const DATE_KEYS = ["minDate", "maxDate", "multiple", "range"];
const BOOLEAN_KEYS = ["label", "description"];

/**
 * The built-in inputs a fetched dialog's field may be drawn by, none of which
 * sends a request, reads a URL or draws another component, each with the
 * option keys its interface-dms `FormComponents` factory emits.
 */
const REQUEST_FREE_INPUTS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries({
    "dms-input-text": [
      "placeholder",
      "minLength",
      "maxLength",
      "showCount",
      "width",
      "preview",
    ],
    "dms-input-textarea": ["placeholder", "maxLength", "showCount", "rows"],
    "dms-input-email": ["placeholder"],
    "dms-input-number": NUMBER_KEYS,
    "dms-input-percentage": NUMBER_KEYS,
    "dms-input-phone": ["placeholder", "requiredPrefix", "defaultCountry"],
    "dms-input-password": [
      "placeholder",
      "minLength",
      "confirmPassword",
      "confirmPlaceholder",
    ],
    "dms-input-color": ["placeholder"],
    "dms-input-time": ["placeholder", "min", "max"],
    "dms-input-select": ["items", "multiple", "placeholder", "deselectable"],
    "dms-radio-group": ["items", "orientation"],
    "dms-segmented-select": ["items"],
    "dms-choice-cards": ["items", "multiple", "columns"],
    "dms-input-checkbox": BOOLEAN_KEYS,
    "dms-input-switch": BOOLEAN_KEYS,
    "dms-boolean-card": [...BOOLEAN_KEYS, "icon"],
    "dms-input-slider": ["min", "max", "step"],
    "dms-input-tags": ["placeholder", "max", "itemType", "suggestions"],
    "dms-input-calendar": DATE_KEYS,
    "dms-date-picker": DATE_KEYS,
    "dms-date-picker-range": ["minDate", "maxDate"],
  }).map(([name, keys]) => [registryKey(name), new Set(keys)]),
);

/** A fetched field with only its input's own options, or `undefined` when no request-free input draws it. */
function drawableField(
  field: ConfirmDialogField,
): ConfirmDialogField | undefined {
  const { componentName, options } = field.component;
  const keys =
    componentName === undefined
      ? undefined
      : REQUEST_FREE_INPUTS.get(registryKey(componentName));
  if (!keys) return undefined;
  const kept = Object.entries(options ?? {}).filter(([key]) => keys.has(key));
  return {
    ...field,
    component: { ...field.component, options: Object.fromEntries(kept) },
  };
}

const LINK_SCHEMES = new Set(["http", "https", "mailto", "tel"]);
const URL_SCHEME = /^([a-z][\d+.a-z-]*):/i;
const LAST_TRIMMED_CODE = 0x20;

/**
 * Whether a link opens no script, read as the browser reads its scheme (tabs
 * and newlines dropped, leading controls trimmed): an allowed scheme, or none
 * and no `{{token}}` before its first `/`, `?` or `#` that could write one.
 */
function isSafeLink(url: string): boolean {
  const kept = url.replace(/[\t\n\r]/g, "");
  let start = 0;
  while (start < kept.length && kept.charCodeAt(start) <= LAST_TRIMMED_CODE) {
    start += 1;
  }
  const read = kept.slice(start);
  const scheme = URL_SCHEME.exec(read)?.[1];
  if (scheme) return LINK_SCHEMES.has(scheme.toLowerCase());
  return !(read.split(/[/?#]/, 1)[0] ?? "").includes("{{");
}

const isSafeSecondaryAction = (
  action: ConfirmDialogSecondaryAction | undefined,
): boolean =>
  action?.target.type !== "external" || isSafeLink(action.target.url);

/**
 * The dialog a `confirm: { from }` URL answered, as the dashboard draws it.
 * The answer is data anyone who writes to that route controls, and the owner
 * confirms it with their session: its `component` is left out and each field
 * keeps only its input's own options. A field drawn by any input but a
 * request-free built-in one, or a secondary link that could run a script,
 * refuses the whole dialog (`undefined`), since leaving it out would change
 * what the action sends or offers.
 */
export function drawableFetchedDialog(
  dialog: ConfirmDialog,
): ConfirmDialog | undefined {
  const { component: _component, fields, ...drawn } = dialog;
  if (!isSafeSecondaryAction(drawn.secondaryAction)) return undefined;
  if (!fields) return drawn;
  const kept = fields.map(drawableField);
  if (kept.includes(undefined)) return undefined;
  return { ...drawn, fields: kept.filter((field) => field !== undefined) };
}

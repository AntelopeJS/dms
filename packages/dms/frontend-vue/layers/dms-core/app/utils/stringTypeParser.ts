export type Primitive =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | Record<string, unknown>
  | unknown[];

const KEYWORD_VALUES = {
  true: true,
  false: false,
  null: null,
  undefined: undefined,
};

const PARSER_REGISTRY = [
  {
    test: isKeyword,
    parse: (value: string) =>
      KEYWORD_VALUES[value as keyof typeof KEYWORD_VALUES],
  },
  {
    test: isStringNumber,
    parse: (value: string) => Number(value),
  },
  {
    test: isStringDate,
    parse: (value: string) => new Date(value),
  },
  {
    test: isStringJSON,
    parse: (value: string) => JSON.parse(value),
  },
];

export function parse(value: string): Primitive {
  for (const parser of PARSER_REGISTRY) {
    if (parser.test(value)) {
      return parser.parse(value);
    }
  }
  return value;
}

export function parseObject(
  items: Array<{ key: string; value: string }>,
): Record<string, Primitive> {
  const result: Record<string, Primitive> = {};
  for (const item of items) {
    result[item.key] = parse(item.value);
  }
  return result;
}

export function isKeyword(value: string): boolean {
  return Object.keys(KEYWORD_VALUES).includes(value);
}

export function isStringNumber(value: string): boolean {
  return value !== "" && !Number.isNaN(Number(value));
}

export function isStringDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)?$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

export function isStringJSON(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

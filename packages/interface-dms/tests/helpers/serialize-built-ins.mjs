import { createRequire } from "node:module";
import {
  CreateDataType,
  serializeType,
} from "../../dist/base/data-types/core.js";

const require = createRequire(import.meta.url);

/** The options each built-in needs to serialize without a data controller. */
const OPTIONS = {
  address: {},
  array: { of: {} },
  boolean: {},
  code: {},
  color: {},
  date: {},
  email: {},
  file: {},
  image: {},
  key_value: {},
  number: {},
  password: {},
  percentage: {},
  phone: {},
  price: {},
  rich_text: {},
  secret: {},
  select: {},
  status: {},
  string: {},
  string_time: {},
  tags: {},
  url: {},
};

/**
 * @param {string} id
 * @param {object} options
 */
const serialize = (id, options) => {
  try {
    return serializeType(CreateDataType(id, options))?.id ?? null;
  } catch (error) {
    return String(error);
  }
};

require(`../../dist/${process.argv[2]}.js`);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(OPTIONS).map(([id, options]) => [
        id,
        serialize(id, options),
      ]),
    ),
  ),
);

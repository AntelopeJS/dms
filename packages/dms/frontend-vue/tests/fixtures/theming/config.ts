import { defu } from "defu";
import defaults from "./base/app/app.config";
import consumer from "./consumer/app/app.config";

export const config = process.env.THEME_DEFAULT
  ? defaults
  : defu(consumer, defaults);

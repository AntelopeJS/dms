import { Controller, Get, HTTPResult } from "@antelopejs/interface-api";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";

const API_ROOT = "/api/playground/frontend-modules";

/** Read by the StatGroup of the block-wiring demo: each read moves its figures. */
export const READS_URL = `${API_ROOT}/reads`;

const HTTP_BAD_REQUEST = 400;
const JSON_TYPE = "application/json";
/** In the playground's locale files, so `useApiError` shows it translated. */
const REFUSED_MESSAGE = "$demo.frontend.toolkit.refused";

const TIME_LOCALE = "en-GB";
const RANDOM_MAX = 100;

let readCount = 0;

interface ReadStat {
  icon: string;
  eyebrow: string;
  value: number | string;
  detail: string;
}

function readStats(): ReadStat[] {
  return [
    {
      icon: "i-ph-arrows-clockwise",
      eyebrow: "Reads",
      value: readCount,
      detail: "Since the server started",
    },
    {
      icon: "i-ph-clock",
      eyebrow: "Read at",
      value: new Date().toLocaleTimeString(TIME_LOCALE, { timeZone: "UTC" }),
      detail: "Server time, UTC",
    },
    {
      icon: "i-ph-dice-five",
      eyebrow: "Random",
      value: Math.round(Math.random() * RANDOM_MAX),
      detail: "Changes on every read",
    },
  ];
}

/** Backs the frontend-module demos: a block to refresh, and the toolkit's calls. */
export class FrontendModulesDemoController extends Controller(API_ROOT) {
  @Get("reads")
  async reads() {
    readCount += 1;
    return { items: readStats() };
  }

  @Get("whoami")
  async whoami(@AuthUser() user: User) {
    return { name: user.name, email: user.email, readAt: new Date() };
  }

  @Get("refused")
  async refused() {
    throw new HTTPResult(
      HTTP_BAD_REQUEST,
      JSON.stringify({ message: REFUSED_MESSAGE }),
      JSON_TYPE,
    );
  }
}

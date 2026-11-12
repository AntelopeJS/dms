import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";
import type { SessionTicket } from "./accounts";

/**
 * The part of Playwright's API `page_verify` drives. Playwright's own
 * declarations do not compile under the TypeScript the DMS builds with, so
 * the module is loaded by name and checked against this shape at the door.
 */
export interface Chromium {
  launch(options: { headless: boolean }): Promise<Browser>;
}

export interface Browser {
  newContext(options: {
    locale: string;
    colorScheme: "light";
  }): Promise<BrowserContext>;
  close(): Promise<void>;
}

export interface ApiResponse {
  ok(): boolean;
  status(): number;
  json(): Promise<JsonValue>;
  text(): Promise<string>;
}

export interface ApiRequest {
  get(url: string): Promise<ApiResponse>;
  post(
    url: string,
    options: { data: SessionTicket; headers: { origin: string } },
  ): Promise<ApiResponse>;
}

export interface Request {
  method(): string;
  url(): string;
  failure(): { errorText: string } | null;
}

export interface Response {
  status(): number;
  url(): string;
  request(): Request;
}

export interface Route {
  request(): Request;
  continue(): Promise<void>;
  abort(errorCode: string): Promise<void>;
}

export interface BrowserContext {
  request: ApiRequest;
  newPage(): Promise<Page>;
  route(url: string, handler: (route: Route) => Promise<void>): Promise<void>;
}

export interface ConsoleMessage {
  type(): string;
  text(): string;
}

export interface Locator {
  first(): Locator;
  last(): Locator;
  nth(index: number): Locator;
  locator(selector: string): Locator;
  count(): Promise<number>;
  click(options?: { timeout: number }): Promise<void>;
  fill(value: string): Promise<void>;
  inputValue(): Promise<string>;
  getAttribute(name: string): Promise<string | null>;
  innerText(options?: { timeout: number }): Promise<string>;
  isVisible(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  screenshot(options: { path: string; timeout?: number }): Promise<Buffer>;
  evaluateAll<R>(fn: (elements: Element[]) => R): Promise<R>;
  page(): Page;
}

/** What a page and a frame both offer: navigation, waiting, locating and evaluating. */
export interface Frame {
  goto(
    url: string,
    options: { waitUntil: "load"; timeout?: number },
  ): Promise<Response | null>;
  waitForFunction(
    expression: string,
    arg: undefined,
    options: { timeout: number },
  ): Promise<object>;
  waitForTimeout(ms: number): Promise<void>;
  locator(selector: string): Locator;
  evaluate<R>(fn: () => R): Promise<R>;
  url(): string;
}

export interface Page extends Frame {
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  screenshot(options: { path: string; fullPage: boolean }): Promise<Buffer>;
  frames(): Frame[];
  context(): BrowserContext;
  getByRole(role: string): Locator;
  keyboard: { press(key: string): Promise<void> };
  close(): Promise<void>;
  on(event: "console", listener: (message: ConsoleMessage) => void): void;
  on(event: "pageerror", listener: (error: Error) => void): void;
  on(event: "response", listener: (response: Response) => void): void;
  on(
    event: "request" | "requestfailed",
    listener: (request: Request) => void,
  ): void;
  off(
    event: "request" | "requestfailed",
    listener: (request: Request) => void,
  ): void;
}

const LaunchableSchema = z.object({ launch: z.function() });

/** Installs browsers into Playwright's cache; `false` when the environment forbids downloads. */
type InstallBrowsers = (browsers: string[]) => Promise<false | undefined>;

/** Playwright's registry module, holding the installer its `install` command runs. */
export const BrowserInstallerSchema = z.object({
  installBrowsersForNpmInstall: z.custom<InstallBrowsers>(
    (installer) => z.function().safeParse(installer).success,
  ),
});

/**
 * Reads the Chromium launcher of a loaded Playwright module. The launcher
 * passes through as loaded: a parsed copy of a function would call it on
 * another receiver.
 */
export const PlaywrightModuleSchema = z.object({
  chromium: z.custom<Chromium>(
    (launcher) => LaunchableSchema.safeParse(launcher).success,
  ),
});

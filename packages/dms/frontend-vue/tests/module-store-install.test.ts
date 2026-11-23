import { describe, expect, it } from "vitest";
import {
  OTHER_PACKAGE_CHOICE,
  areDependencyDraftsValid,
  buildInstallBody,
  createDependencyDrafts,
  isNpmPackageName,
  parseDependencyConfig,
  validateDependencyDraft,
} from "../layers/dms-layout/app/entries/utils/module-store-install";
import { QUEUE, REDIS } from "./helpers/module-store-catalog-fixtures";
import { defined } from "./helpers/defined";

const draftAt = (
  interfaces: Parameters<typeof createDependencyDrafts>[0],
  index: number,
) => defined(createDependencyDrafts(interfaces)[index]);

describe("module store install dialog", () => {
  it("accepts npm package names only", () => {
    expect(isNpmPackageName("redis")).toBe(true);
    expect(isNpmPackageName("@antelopejs/redis")).toBe(true);
    expect(isNpmPackageName("Redis")).toBe(false);
    expect(isNpmPackageName("git+https://github.com/a/b.git")).toBe(false);
    expect(isNpmPackageName("./local/module")).toBe(false);
    expect(isNpmPackageName("@scope")).toBe(false);
    expect(isNpmPackageName("a".repeat(215))).toBe(false);
  });

  it("reads an empty config as none and refuses anything but an object", () => {
    expect(parseDependencyConfig("  ")).toEqual({ isValid: true });
    expect(parseDependencyConfig('{ "url": "redis://cache" }')).toEqual({
      isValid: true,
      config: { url: "redis://cache" },
    });
    expect(parseDependencyConfig("[]").isValid).toBe(false);
    expect(parseDependencyConfig("null").isValid).toBe(false);
    expect(parseDependencyConfig("{ url: }").isValid).toBe(false);
  });

  it("preselects the first candidate, or the other package without one", () => {
    expect(
      createDependencyDrafts([REDIS, QUEUE]).map((draft) => draft.choice),
    ).toEqual(["@antelopejs/redis", OTHER_PACKAGE_CHOICE]);
  });

  it("keeps what an earlier attempt picked for the same interface", () => {
    const earlier = draftAt([REDIS], 0);
    const edited = {
      ...earlier,
      choice: "@antelopejs/valkey",
      config: "{}",
    };
    expect(createDependencyDrafts([REDIS, QUEUE], [edited])[0]).toEqual(edited);
  });

  it("flags a missing or invalid package and a config that is not an object", () => {
    const draft = draftAt([QUEUE], 0);
    expect(validateDependencyDraft(draft)).toEqual({
      package: "package_required",
    });
    expect(
      validateDependencyDraft({
        ...draft,
        otherPackage: "github:acme/queue",
        config: "[1]",
      }),
    ).toEqual({ package: "package_invalid", config: "config_invalid" });
    expect(
      areDependencyDraftsValid([{ ...draft, otherPackage: " @acme/queue " }]),
    ).toBe(true);
  });

  it("builds the install body, leaving out an empty config", () => {
    const redis = draftAt([REDIS, QUEUE], 0);
    const queue = draftAt([REDIS, QUEUE], 1);
    expect(
      buildInstallBody("cache", [
        redis,
        {
          ...queue,
          otherPackage: "@acme/queue",
          config: '{"size":2}',
        },
      ]),
    ).toEqual({
      id: "cache",
      dependencies: [
        {
          interfacePackage: "@antelopejs/interface-redis",
          package: "@antelopejs/redis",
        },
        {
          interfacePackage: "@antelopejs/interface-queue",
          package: "@acme/queue",
          config: { size: 2 },
        },
      ],
    });
    expect(buildInstallBody("cache", [])).toEqual({ id: "cache" });
  });
});

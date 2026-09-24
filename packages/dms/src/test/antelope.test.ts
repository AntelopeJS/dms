import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@antelopejs/interface-core/config";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

// Core runs tests outside development mode, where the api refuses to fall back
// to the next free port. Asking for any free port keeps the harness off
// whatever already holds a fixed one; the api publishes the port it reserved.
const ANY_FREE_PORT = 0;
// Required outside development mode. Nothing in the harness consumes
// API_PUBLIC_BASE_URL: every in-process URL derives from API_LOCAL_BASE_URL.
const UNUSED_PUBLIC_BASE_URL = "https://api.test.example.com";
const API_LOCAL_BASE_URL = "${@api.API_LOCAL_BASE_URL}";
const JWT_SECRET = "test-jwt-secret";
const BOOTSTRAP_SECRET = "test-bootstrap-secret";
const MONGO_BINARY_VERSION = "8.0.8";
const LOCAL_API_PATH = process.env.DMS_TEST_API_PATH;
const LOCAL_MONGODB_PATH = process.env.DMS_TEST_MONGODB_PATH;
const LOCAL_STORAGE_PATH = process.env.DMS_TEST_STORAGE_PATH;

function providerSource(
  path: string | undefined,
  packageName: string,
  version: string,
) {
  if (path) {
    return {
      type: "local" as const,
      path,
      installCommand: ["pnpm build"],
    };
  }
  return { type: "package" as const, package: packageName, version };
}

let mongod: MongoMemoryReplSet;
let storageDir: string;

export default defineConfig({
  name: "dms-test",
  cacheFolder: ".antelope/cache",
  logging: {
    channelFilter: {
      "*": "warn",
    },
  },
  modules: {
    local: {
      source: {
        type: "local",
        path: ".",
        installCommand: ["pnpm build"],
      },
      config: {
        auth: {
          jwtSecret: JWT_SECRET,
        },
        frontend: {
          bootstrapSecret: BOOTSTRAP_SECRET,
        },
      },
    },
    "attachment-host": {
      source: {
        type: "local",
        path: "src/test/attachment-host",
      },
    },
    "api-endpoint": {
      source: {
        type: "local",
        path: "src/test/api-endpoint",
      },
      config: {
        apiBaseUrl: API_LOCAL_BASE_URL,
      },
    },
    mongodb: {
      source: providerSource(
        LOCAL_MONGODB_PATH,
        "@antelopejs/mongodb",
        "1.3.1",
      ),
    },
    "auth-jwt": {
      source: {
        type: "package",
        package: "@antelopejs/auth-jwt",
        version: "1.0.3",
      },
      config: {
        secret: JWT_SECRET,
      },
    },
    api: {
      source: providerSource(LOCAL_API_PATH, "@antelopejs/api", "^1.3.0"),
      config: {
        publicBaseUrl: UNUSED_PUBLIC_BASE_URL,
        servers: [{ protocol: "http", host: "127.0.0.1", port: ANY_FREE_PORT }],
      },
    },
    "file-storage-local": {
      source: providerSource(
        LOCAL_STORAGE_PATH,
        "@antelopejs/file-storage-local",
        "0.1.5",
      ),
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: "0.0.5",
      },
      config: {
        ethereal: true,
      },
    },
  },
  test: {
    // The runner recursively discovers `*.test.js` under this folder. Subset
    // scripts (`test:unit` / `test:integration`) narrow it to a subdirectory
    // via DMS_TEST_DIR; the default runs the whole suite.
    folder: process.env.DMS_TEST_DIR ?? "dist/test",
    async setup() {
      mongod = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        binary: { version: MONGO_BINARY_VERSION },
      });
      storageDir = await mkdtemp(join(tmpdir(), "dms-test-storage-"));

      const mongoUrl = mongod.getUri();
      process.env.TEST_MONGO_URL = mongoUrl;
      process.env.TEST_JWT_SECRET = JWT_SECRET;
      process.env.TEST_BOOTSTRAP_SECRET = BOOTSTRAP_SECRET;

      return {
        modules: {
          mongodb: {
            config: { url: mongoUrl, database: "dms-core" },
          },
          "file-storage-local": {
            config: {
              storagePath: storageDir,
              baseUrl: API_LOCAL_BASE_URL,
              defaultVisibility: "private",
            },
          },
        },
      };
    },
    async cleanup() {
      try {
        if (mongod) await mongod.stop();
      } finally {
        if (storageDir) await rm(storageDir, { recursive: true, force: true });
      }
    },
  },
});

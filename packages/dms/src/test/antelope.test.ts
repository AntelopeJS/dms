import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@antelopejs/interface-core/config";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

const ANY_FREE_PORT = 0;

const UNUSED_PUBLIC_BASE_URL = "https://api.test.example.com";
const API_LOCAL_BASE_URL = "${@api.API_LOCAL_BASE_URL}";
const JWT_SECRET = "test-jwt-secret";

const CLIENT_BASE_URL = "http://localhost:3001";
const HTML_RENDER_SECRET = "test-html-render-secret";
const BOOTSTRAP_SECRET = "test-bootstrap-secret";
const MONGO_BINARY_VERSION = "8.0.8";

const UNREACHABLE_SMTP_HOST = "127.0.0.1";
const CLOSED_SMTP_PORT = 1;
const LOCAL_API_PATH = process.env.DMS_TEST_API_PATH;
const LOCAL_MONGODB_PATH = process.env.DMS_TEST_MONGODB_PATH;
const LOCAL_STORAGE_PATH = process.env.DMS_TEST_STORAGE_PATH;

const LOCAL_INSTALL_COMMAND = process.env.DMS_PREBUILT ? [] : ["pnpm build"];

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
        installCommand: LOCAL_INSTALL_COMMAND,
      },
      config: {
        clientBaseUrl: CLIENT_BASE_URL,
        auth: {
          jwtSecret: JWT_SECRET,
        },
        htmlRender: {
          serviceSecret: HTML_RENDER_SECRET,
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

    "reload-host": {
      source: {
        type: "local",
        path: "dist/test/reload-host",
      },
    },
    "invite-extension-host": {
      source: {
        type: "local",
        path: "dist/test/invite-extension-host",
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
        "1.5.0",
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
      source: providerSource(LOCAL_API_PATH, "@antelopejs/api", ">=1.5.0 <2"),
      config: {
        publicBaseUrl: UNUSED_PUBLIC_BASE_URL,
        servers: [{ protocol: "http", host: "127.0.0.1", port: ANY_FREE_PORT }],
      },
    },
    "file-storage-local": {
      source: providerSource(
        LOCAL_STORAGE_PATH,
        "@antelopejs/file-storage-local",
        "0.1.13",
      ),
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: "0.0.6",
      },
      config: {
        host: UNREACHABLE_SMTP_HOST,
        port: CLOSED_SMTP_PORT,
      },
    },
  },
  test: {
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

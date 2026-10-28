import { defineConfig } from "@antelopejs/interface-core/config";

const preferredApiPort = process.env.PORT ?? "5010";
const dmsClientUrl = process.env.DMS_CLIENT_BASE_URL;

export default defineConfig({
  name: "test",
  logging: {
    channelFilter: {
      "*": "trace",
    },
  },
  modules: {
    dms: {
      source: {
        type: "local",
        path: "..",
        watchDir: ["src"],
        installCommand: ["pnpm build", "pnpm --dir playground build"],
      },
      config: {
        homepage: "/examples/overview",
        meta: {
          title: "AntelopeJS",
          description: "AntelopeJS DMS playground",
        },
        auth: {
          jwtSecret: process.env.DMS_JWT_SECRET ?? "dev",
          signInCountry: { database: false },
        },
        htmlRender: {
          serviceSecret: process.env.DMS_HTML_RENDER_SECRET ?? "dev",
        },
        apiBaseUrl: "${@api.API_PUBLIC_BASE_URL}",
        clientBaseUrl: dmsClientUrl,
        frontend: {
          bootstrapSecret: process.env.DMS_BOOTSTRAP_SECRET,
        },
        docsPreview: true,
      },
    },
    playground: {
      source: {
        type: "local",
        path: ".",
        watchDir: ["src"],
        reloadCommand: ["pnpm exec tsc"],
      },
    },
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "^1.4.3",
      },
      config: {
        url: process.env.MONGO_URL ?? "mongodb://localhost:27017",
        database: process.env.MONGO_DATABASE ?? "playground_dms",
      },
      importOverrides: [],
      disabledExports: [],
    },
    "auth-jwt": {
      source: {
        type: "package",
        package: "@antelopejs/auth-jwt",
        version: "^1.0.4",
      },
      config: {
        secret: process.env.AUTH_JWT_SECRET ?? "dev",
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: "^1.5.0",
      },
      config: {
        servers: [{ protocol: "http", port: preferredApiPort }],
        publicBaseUrl: dmsClientUrl,
        cors: {
          allowedOrigins: [
            "http://localhost:3001",
            /^https:\/\/[a-z0-9-]+\.onamp\.dev$/,
          ],
        },
      },
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: ">=0.1.13 <1.0.0",
      },
      config: {
        storagePath: ".antelope/file-storage",
        baseUrl: "${@api.API_PUBLIC_BASE_URL}",
        defaultVisibility: "private",
        stagingExpiration: 86400,
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: ">=0.0.6 <1.0.0",
      },
      config: {
        ethereal: true,
      },
    },
  },
  environments: {
    docs: {
      logging: { channelFilter: { "*": "warn" } },
      modules: {
        nodemailer: {
          config: { ethereal: false, host: "127.0.0.1", port: 9 },
        },
      },
    },
  },
});

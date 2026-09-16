import { defineConfig } from "@antelopejs/interface-core/config";

const apiPort = process.env.PORT ?? "5010";
const dmsClientUrl = process.env.DMS_CLIENT_BASE_URL;

export default defineConfig({
  name: "test",
  logging: {
    channelFilter: {
      "*": "trace",
    },
  },
  modules: {
    playground: {
      source: {
        type: "local",
        path: ".",
        watchDir: ["src"],
        installCommand: ["true"],
        reloadCommand: ["pnpm build"],
      },
    },
    dms: {
      source: {
        type: "local",
        path: "..",
        watchDir: ["src"],
        installCommand: ["true"],
      },
      config: {
        homepage: "/form/form-simple",
        meta: {
          title: "AntelopeJS",
          description: "AntelopeJS DMS playground",
        },
        auth: {
          // Signs the DMS's own internal tokens — upload-destination binding,
          // OAuth state and relay, email validation, password recovery — and is
          // distinct from the auth-jwt module's session secret, which is why
          // logging in works without it. Left unset it defaults to "", and both
          // serving a page that holds a File/Image field and starting an OAuth
          // flow fail with a 500. Development value: a real deployment must
          // supply its own.
          jwtSecret: "dev",
        },
      },
    },
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "^1.2.7",
      },
      config: {
        url: "mongodb://localhost:27017",
        database: "playground_dms",
      },
      importOverrides: [],
      disabledExports: [],
    },
    "auth-jwt": {
      source: {
        type: "package",
        package: "@antelopejs/auth-jwt",
        version: "^1.0.3",
      },
      config: {
        secret: "dev",
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: "1.2.5",
      },
      config: {
        servers: [{ protocol: "http", port: apiPort }],
        cors: {
          allowedOrigins: [
            "http://localhost:3001",
            /^https:\/\/[a-z0-9-]+\.onamp\.dev$/,
            ...(dmsClientUrl ? [dmsClientUrl] : []),
          ],
        },
      },
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: "^0.1.3",
      },
      config: {
        storagePath: ".antelope/file-storage",
        baseUrl: "http://127.0.0.1:5010",
        defaultVisibility: "private",
        // Sweep abandoned staged uploads (files presigned with `staging: true`
        // but never saved, so never promoted out of `__staging__/`) after this
        // TTL, in seconds — otherwise they accumulate as permanent orphans.
        // Confirmed uploads are promoted on form save and are never swept.
        // S3-backed deployments should configure a lifecycle rule via
        // `stagingExpirationDays` instead.
        stagingExpiration: 86400,
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: "^0.0.4",
      },
      config: {
        ethereal: true,
      },
    },
  },
});

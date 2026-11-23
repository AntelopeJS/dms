/**
 * The project `published-dms.mjs` runs: the dms module at `PUBLISHED_DMS_PATH`
 * with the providers it requires, on the database `PUBLISHED_DMS_DATABASE` of
 * the MongoDB at `PUBLISHED_DMS_MONGO_URL`.
 *
 * @packageDocumentation
 */

const path = require("node:path");

const JWT_SECRET = "published-dms-jwt-secret";

module.exports = {
  name: "published-dms",
  cacheFolder: ".antelope/cache",
  logging: { channelFilter: { "*": "error" } },
  modules: {
    dms: {
      source: { type: "local", path: process.env.PUBLISHED_DMS_PATH },
      config: {
        clientBaseUrl: "http://localhost:3001",
        auth: { jwtSecret: JWT_SECRET },
        htmlRender: { serviceSecret: "published-dms-html-render-secret" },
        frontend: { bootstrapSecret: "published-dms-bootstrap-secret" },
        mcp: { enabled: false },
      },
    },
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "1.8.4",
      },
      config: {
        url: process.env.PUBLISHED_DMS_MONGO_URL,
        database: process.env.PUBLISHED_DMS_DATABASE,
      },
    },
    "auth-jwt": {
      source: {
        type: "package",
        package: "@antelopejs/auth-jwt",
        version: "1.0.3",
      },
      config: { secret: JWT_SECRET },
    },
    api: {
      source: { type: "package", package: "@antelopejs/api", version: "1.7.0" },
      config: {
        publicBaseUrl: "https://api.test.example.com",
        servers: [{ protocol: "http", host: "127.0.0.1", port: 0 }],
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: "0.0.12",
      },
      config: { host: "127.0.0.1", port: 1 },
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: "0.1.13",
      },
      config: {
        storagePath: path.join(__dirname, ".storage"),
        baseUrl: "${@api.API_LOCAL_BASE_URL}",
        defaultVisibility: "private",
      },
    },
  },
  test: { folder: "test" },
};

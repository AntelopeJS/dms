import { expect } from "chai";
import {
  listDroppedBackendProxies,
  type ManifestModuleEntry,
  stripPrivateManifestFields,
} from "../../../../store/frontend";

interface LayerEntry extends ManifestModuleEntry {
  name: string;
  priority: number;
  configKey?: string;
}

function buildManifest(): ReturnType<
  typeof stripPrivateManifestFields<LayerEntry>
> {
  return {
    modules: [
      {
        name: "@scope/dms-frontend",
        priority: 0,
        configKey: "dms",
        path: "/srv/app/node_modules/@scope/dms/frontend",
        options: { baseURL: "https://api.example.com" },
        privateOptions: { oauth: { relaySecret: "s3cret" } },
        authEstablishEndpoints: ["/api/saas/register/finalize"],
        publicEndpoints: [
          { path: "/api/hooks/*", methods: ["POST"], headers: [] },
        ],
        backendProxies: [{ path: "/media/**", auth: "none" }],
      },
      {
        name: "@scope/dms-lang-layer",
        priority: 1,
        path: "/srv/app/node_modules/@scope/dms-lang/frontend",
      },
    ],
  };
}

describe("[unit] manifest field policy", () => {
  it("keeps everything when the caller is entitled to every field", () => {
    const manifest = buildManifest();
    const sanitized = stripPrivateManifestFields(manifest, {
      privateOptions: true,
      path: true,
      authEstablishEndpoints: true,
    });
    expect(sanitized).to.deep.equal(manifest);
  });

  it("drops private options while keeping paths", () => {
    const sanitized = stripPrivateManifestFields(buildManifest(), {
      privateOptions: false,
      path: true,
      authEstablishEndpoints: false,
    });
    for (const module of sanitized.modules) {
      expect(module).to.not.have.property("privateOptions");
    }
    expect(sanitized.modules[0].path).to.equal(
      "/srv/app/node_modules/@scope/dms/frontend",
    );
  });

  it("drops paths while keeping private options", () => {
    const sanitized = stripPrivateManifestFields(buildManifest(), {
      privateOptions: true,
      path: false,
      authEstablishEndpoints: true,
    });
    for (const module of sanitized.modules) {
      expect(module).to.not.have.property("path");
    }
    expect(sanitized.modules[0].privateOptions).to.deep.equal({
      oauth: { relaySecret: "s3cret" },
    });
  });

  it("drops every private field for an anonymous caller", () => {
    const sanitized = stripPrivateManifestFields(buildManifest(), {
      privateOptions: false,
      path: false,
      authEstablishEndpoints: false,
    });
    for (const module of sanitized.modules) {
      expect(module).to.not.have.property("privateOptions");
      expect(module).to.not.have.property("path");
      expect(module).to.not.have.property("authEstablishEndpoints");
      expect(module).to.not.have.property("publicEndpoints");
      expect(module).to.not.have.property("backendProxies");
    }
  });

  it("serves the declared establish endpoints to an entitled caller", () => {
    const sanitized = stripPrivateManifestFields(buildManifest(), {
      privateOptions: false,
      path: false,
      authEstablishEndpoints: true,
    });
    expect(sanitized.modules[0].authEstablishEndpoints).to.deep.equal([
      "/api/saas/register/finalize",
    ]);
    expect(sanitized.modules[0].publicEndpoints).to.have.length(1);
    expect(sanitized.modules[0].backendProxies).to.deep.equal([
      { path: "/media/**", auth: "none" },
    ]);
    expect(sanitized.modules[1]).to.not.have.property("authEstablishEndpoints");
  });

  it("leaves every other field untouched", () => {
    const sanitized = stripPrivateManifestFields(buildManifest(), {
      privateOptions: false,
      path: false,
      authEstablishEndpoints: false,
    });
    expect(sanitized.modules[0].name).to.equal("@scope/dms-frontend");
    expect(sanitized.modules[0].priority).to.equal(0);
    expect(sanitized.modules[0].configKey).to.equal("dms");
    expect(sanitized.modules[0].options).to.deep.equal({
      baseURL: "https://api.example.com",
    });
  });

  it("never mutates the registry it was given", () => {
    const manifest = buildManifest();
    stripPrivateManifestFields(manifest, {
      privateOptions: false,
      path: false,
      authEstablishEndpoints: false,
    });
    expect(manifest).to.deep.equal(buildManifest());
  });
});

describe("[unit] dropped backend proxies", () => {
  it("names each proxy withheld from a caller without the routing declarations", () => {
    const { modules } = buildManifest();
    modules[1].backendProxies = [{ path: "/files/*" }];
    expect(
      listDroppedBackendProxies(modules, {
        privateOptions: false,
        path: false,
        authEstablishEndpoints: false,
      }),
    ).to.deep.equal([
      "@scope/dms-frontend /media/**",
      "@scope/dms-lang-layer /files/*",
    ]);
  });

  it("names none when the caller receives them", () => {
    expect(
      listDroppedBackendProxies(buildManifest().modules, {
        privateOptions: true,
        path: true,
        authEstablishEndpoints: true,
      }),
    ).to.deep.equal([]);
  });
});

// Builds publishable npm packages for `alice-and-bot` (SDK) and
// `alice-and-bot-mcp` (MCP stdio CLI) without any JSR registry dependency.

const rootDir = new URL("../", import.meta.url).pathname;
const denoJson = JSON.parse(await Deno.readTextFile(`${rootDir}deno.json`));
const version: string = denoJson.version;

const npmRoot = `${rootDir}dist/npm`;
const sdkDir = `${npmRoot}/alice-and-bot`;
const mcpDir = `${npmRoot}/alice-and-bot-mcp`;

const run = async (cmd: string, args: string[], cwd = rootDir) => {
  const out = await new Deno.Command(cmd, { args, cwd }).output();
  if (!out.success) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed:\n${
        new TextDecoder().decode(out.stderr)
      }`,
    );
  }
  return new TextDecoder().decode(out.stdout);
};

const extractJsrDeclarations = async (targetDir: string) => {
  const metaRes = await fetch("https://npm.jsr.io/@jsr/alice-and-bot__core");
  if (!metaRes.ok) {
    throw new Error(`Failed to fetch JSR npm metadata: ${metaRes.status}`);
  }
  const meta = await metaRes.json();
  const verEntry = meta.versions?.[version] ??
    meta.versions?.[meta["dist-tags"]?.latest];
  const tarballUrl: string | undefined = verEntry?.dist?.tarball;
  if (!tarballUrl) {
    throw new Error("Could not resolve JSR tarball URL for declarations");
  }
  const tmpDir = await Deno.makeTempDir({ prefix: "alice-jsr-dts-" });
  try {
    const tgzPath = `${tmpDir}/pkg.tgz`;
    const res = await fetch(tarballUrl);
    if (!res.ok) {
      throw new Error(`Failed to download JSR tarball: ${res.status}`);
    }
    await Deno.writeFile(tgzPath, new Uint8Array(await res.arrayBuffer()));
    await run("tar", ["-xzf", tgzPath, "-C", tmpDir]);
    await Deno.mkdir(`${targetDir}/_dist`, { recursive: true });
    await run("cp", ["-R", `${tmpDir}/package/_dist/.`, `${targetDir}/_dist/`]);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
};

const buildSdkPackage = async () => {
  await Deno.remove(sdkDir, { recursive: true }).catch(() => {});
  await Deno.mkdir(sdkDir, { recursive: true });

  const externalPackages = [
    "@instantdb/admin",
    "@instantdb/core",
    "@lit/react",
    "@noble/hashes",
    "emoji-picker-element",
    "highlight.js",
    "jsqr",
    "lit",
    "marked",
    "qrcode",
    "react",
    "react-dom",
    "safe-stable-stringify",
    "web-push",
    "zod",
  ];

  await run("deno", [
    "bundle",
    "--config",
    "deno.json",
    "--format",
    "esm",
    "--code-splitting",
    ...externalPackages.map((pkg) => `--external=${pkg}`),
    "mod.ts",
    "components.ts",
    "canvas/server.ts",
    "--outdir",
    sdkDir,
  ]);

  await extractJsrDeclarations(sdkDir);
  await Deno.copyFile(`${rootDir}README.md`, `${sdkDir}/README.md`);
  await Deno.copyFile(`${rootDir}LICENSE`, `${sdkDir}/LICENSE`);

  const sdkPkg = {
    name: "alice-and-bot",
    version,
    description:
      "A chat network for agents. Open-source, end-to-end encrypted messaging SDK, React chat UI, and embeddable widgets for AI agents and humans.",
    license: "MIT",
    type: "module",
    homepage: "https://aliceandbot.com",
    repository: {
      type: "git",
      url: "git+https://github.com/uriva/alice-and-bot.git",
    },
    bugs: {
      url: "https://github.com/uriva/alice-and-bot/issues",
    },
    keywords: [
      "ai-agents",
      "chat",
      "e2e-encryption",
      "messaging",
      "multi-agent",
      "webhooks",
      "chat-widget",
      "mcp",
      "whatsapp-alternative",
    ],
    exports: {
      ".": {
        types: "./_dist/mod.d.ts",
        default: "./mod.js",
      },
      "./components": {
        types: "./_dist/components.d.ts",
        default: "./components.js",
      },
      "./canvas": {
        types: "./_dist/canvas/server.d.ts",
        default: "./canvas/server.js",
      },
    },
    types: "./_dist/mod.d.ts",
    main: "./mod.js",
    files: [
      "mod.js",
      "components.js",
      "canvas/",
      "chunk-*.js",
      "_dist/",
      "README.md",
      "LICENSE",
    ],
    dependencies: {
      "@instantdb/admin": "1.0.65",
      "@instantdb/core": "1.0.65",
      "@lit/react": "1.0.8",
      "emoji-picker-element": "^1.29.1",
      "highlight.js": "^11.11.1",
      "lit": "3.3.2",
      "marked": "15.0.7",
      "qrcode": "1.5.4",
      "react": "^18.0.0 || ^19.0.0",
      "safe-stable-stringify": "2.5.0",
      "zod": "3.25.57",
    },
    engines: {
      node: ">=20.0.0",
    },
  };

  await Deno.writeTextFile(
    `${sdkDir}/package.json`,
    `${JSON.stringify(sdkPkg, null, 2)}\n`,
  );
};

const buildMcpPackage = async () => {
  await Deno.remove(mcpDir, { recursive: true }).catch(() => {});
  await Deno.mkdir(`${mcpDir}/bin`, { recursive: true });

  const binPath = `${mcpDir}/bin/alice-and-bot-mcp.js`;
  await run("deno", [
    "bundle",
    "--config",
    "mcp/deno.json",
    "--minify",
    "--format",
    "esm",
    "mcp/cli.ts",
    "--output",
    binPath,
  ]);

  const raw = await Deno.readTextFile(binPath);
  await Deno.writeTextFile(binPath, `#!/usr/bin/env node\n${raw}`);
  await Deno.chmod(binPath, 0o755);

  await Deno.copyFile(`${rootDir}mcp/README.md`, `${mcpDir}/README.md`);
  await Deno.copyFile(`${rootDir}LICENSE`, `${mcpDir}/LICENSE`);

  const mcpPkg = {
    name: "alice-and-bot-mcp",
    version,
    mcpName: "io.github.uriva/alice-and-bot",
    description:
      "End-to-end encrypted MCP server for chatting with any AI agent from your phone via Alice&Bot.",
    license: "MIT",
    type: "module",
    homepage: "https://aliceandbot.com/mcp",
    repository: {
      type: "git",
      url: "git+https://github.com/uriva/alice-and-bot.git",
      directory: "mcp",
    },
    bugs: {
      url: "https://github.com/uriva/alice-and-bot/issues",
    },
    keywords: [
      "mcp",
      "mcp-server",
      "model-context-protocol",
      "ai-agents",
      "e2e-encryption",
      "chat",
      "alice-and-bot",
    ],
    bin: {
      "alice-and-bot-mcp": "bin/alice-and-bot-mcp.js",
    },
    files: ["bin/", "README.md", "LICENSE"],
    engines: {
      node: ">=20.0.0",
    },
  };

  await Deno.writeTextFile(
    `${mcpDir}/package.json`,
    `${JSON.stringify(mcpPkg, null, 2)}\n`,
  );

  const serverJson = JSON.parse(
    await Deno.readTextFile(`${rootDir}mcp/server.json`),
  );
  serverJson.version = version;
  if (Array.isArray(serverJson.packages) && serverJson.packages[0]) {
    serverJson.packages[0].version = version;
  }
  await Deno.writeTextFile(
    `${mcpDir}/server.json`,
    `${JSON.stringify(serverJson, null, 2)}\n`,
  );
};

await buildSdkPackage();
await buildMcpPackage();
console.log(
  `Built npm packages alice-and-bot@${version} and alice-and-bot-mcp@${version} in dist/npm/`,
);

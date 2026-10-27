// deno-lint-ignore-file
await Deno.mkdir("dist", { recursive: true });

const p = new Deno.Command("deno", {
  args: [
    "bundle",
    "--minify",
    "--config",
    "deno.json",
    "backend/src/worker.ts",
    "--output",
    "dist/worker.js",
  ],
});
const out = await p.output();
if (!out.success) {
  console.error(new TextDecoder().decode(out.stderr));
  Deno.exit(out.code);
}

let code = await Deno.readTextFile("dist/worker.js");

const readmeContent = await Deno.readTextFile("README.md");
code = code.replace(
  /Deno\.readTextFileSync\(new URL\("[^"]*README\.md",\s*import\.meta\.url\)\)/g,
  JSON.stringify(readmeContent),
);

code = code.replaceAll(
  "import.meta.url",
  '(import.meta.url || "file:///worker.js")',
);
code = code.replaceAll("import.meta.main", "false");

code = code.replaceAll(
  /\b[a-zA-Z0-9_$]+\("node:process"\)/g,
  "(globalThis.process||{env:{}})",
);
code = code.replaceAll(
  /\b[a-zA-Z0-9_$]+\("process"\)/g,
  "(globalThis.process||{env:{}})",
);

// Zod v4 jitless mode for Cloudflare Workers
code = code.replaceAll(/![a-zA-Z0-9_$]+\.jitless/g, "false");

// Force Gaxios (@google-cloud/storage) to use native Worker fetch instead of node-fetch
code = code.replaceAll("window.fetch", "globalThis.fetch");
code = code.replaceAll('typeof window<"u"&&!!window', "true");

code = code.replaceAll(
  `throw Error('Dynamic require of "'+t+'" is not supported')`,
  `return __cf_safe_require(t)`,
);

code = code.replace(
  /class\{[^{}]*constructor\([a-zA-Z0-9_,]+\)\{this\.ctx=[a-zA-Z0-9_]+,this\.env=[a-zA-Z0-9_]+\}\}/,
  "__CF_DurableObject",
);

const polyfillHeader =
  `import { DurableObject as __CF_DurableObject, env as __cf_env } from "cloudflare:workers";
import { createRequire as __cf_createRequire } from "node:module";
const __cf_require = __cf_createRequire("file:///worker.js");
globalThis.__dirname = "/";
globalThis.__filename = "/worker.js";
if (typeof globalThis.process === "undefined") {
  globalThis.process = { env: {} };
}
globalThis.process.env ??= {};
if (__cf_env && typeof __cf_env === "object") {
  for (const [k, v] of Object.entries(__cf_env)) {
    if (typeof v === "string") globalThis.process.env[k] = v;
  }
}
const __cf_safe_require = function(spec) {
  if (spec === "node:process" || spec === "process") return globalThis.process;
  try {
    const mod = __cf_require(spec);
    return mod ?? {};
  } catch (_err) {
    return {};
  }
};
globalThis.require = __cf_safe_require;
if (typeof globalThis.addEventListener === "undefined") {
  globalThis.addEventListener = () => {};
}

if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
  const __orig_randomUUID = globalThis.crypto.randomUUID.bind(globalThis.crypto);
  let __uuid_counter = 0;
  globalThis.crypto.randomUUID = function() {
    try {
      return __orig_randomUUID();
    } catch (_err) {
      __uuid_counter++;
      return "00000000-0000-4000-8000-" + String(__uuid_counter).padStart(12, "0");
    }
  };
}
if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
  const __orig_getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  globalThis.crypto.getRandomValues = function(arr) {
    try {
      return __orig_getRandomValues(arr);
    } catch (_err) {
      for (let i = 0; i < arr.length; i++) arr[i] = (Math.random() * 256) | 0;
      return arr;
    }
  };
}
if (typeof globalThis.fetch === "function") {
  globalThis.fetch = globalThis.fetch.bind(globalThis);
}
if (typeof globalThis.clearTimeout === "function") {
  globalThis.clearTimeout = globalThis.clearTimeout.bind(globalThis);
}
if (typeof globalThis.clearInterval === "function") {
  globalThis.clearInterval = globalThis.clearInterval.bind(globalThis);
}
if (typeof globalThis.setTimeout !== "undefined") {
  const __orig_setTimeout = globalThis.setTimeout.bind(globalThis);
  globalThis.setTimeout = function(fn, ms, ...args) {
    try {
      return __orig_setTimeout(fn, ms, ...args);
    } catch (_err) {
      return 0;
    }
  };
}
if (typeof globalThis.setInterval !== "undefined") {
  const __orig_setInterval = globalThis.setInterval.bind(globalThis);
  globalThis.setInterval = function(fn, ms, ...args) {
    try {
      return __orig_setInterval(fn, ms, ...args);
    } catch (_err) {
      return 0;
    }
  };
}

const __cf_upgradeWebSocket = (_req) => {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  return {
    socket: server,
    response: new Response(null, { status: 101, webSocket: client }),
  };
};
if (typeof globalThis.Deno === "undefined") {
  globalThis.Deno = {
    version: { deno: "2.1.0" },
    mainModule: "file:///worker.js",
    env: {
      get: (k) => globalThis.process?.env?.[k] ?? (__cf_env && typeof __cf_env[k] === "string" ? __cf_env[k] : undefined),
      set: (k, v) => {
        if (globalThis.process?.env) globalThis.process.env[k] = v;
      },
      delete: (k) => {
        if (globalThis.process?.env) delete globalThis.process.env[k];
      },
      toObject: () => globalThis.process?.env ?? {},
    },
    serve: () => {},
    upgradeWebSocket: __cf_upgradeWebSocket,
    readTextFileSync: () => "",
    readTextFile: () => Promise.resolve(""),
  };
} else {
  globalThis.Deno.version ??= { deno: "2.1.0" };
  globalThis.Deno.upgradeWebSocket ??= __cf_upgradeWebSocket;
  globalThis.Deno.readTextFileSync ??= () => "";
  globalThis.Deno.readTextFile ??= () => Promise.resolve("");
}
`;

code = polyfillHeader + code;
await Deno.writeTextFile("dist/worker.js", code);
const stat = await Deno.stat("dist/worker.js");
console.log(
  `Successfully built and patched dist/worker.js for Cloudflare Workers (${
    Math.round(stat.size / 1024)
  } KB)`,
);

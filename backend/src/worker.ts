// deno-lint-ignore-file
import { DurableObject } from "cloudflare:workers";
import { handleRequest, setRequestWaitUntil } from "./main.ts";

export interface Env {
  ALICE_DO?: {
    idFromName(name: string): unknown;
    get(
      id: unknown,
      options?: { locationHint?: string },
    ): { fetch(req: Request): Promise<Response> };
  };
  [key: string]: unknown;
}

const syncEnv = (env: Record<string, unknown> | undefined) => {
  if (!env || typeof env !== "object") return;
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && v.length > 0) {
      Deno.env.set(k, v);
    }
  }
};

export class AliceDO extends DurableObject {
  private doCtx: { waitUntil?(promise: Promise<unknown>): void } | undefined;

  constructor(ctx: unknown, env: Env) {
    super(ctx, env);
    this.doCtx = ctx as { waitUntil?(promise: Promise<unknown>): void };
    syncEnv(env);
  }

  async fetch(request: Request): Promise<Response> {
    syncEnv(this.env as Record<string, unknown>);
    if (this.doCtx && typeof this.doCtx.waitUntil === "function") {
      setRequestWaitUntil(this.doCtx.waitUntil.bind(this.doCtx));
    }
    return await handleRequest(request);
  }
}

export const workerHandler = {
  async fetch(
    request: Request,
    env: Env,
    ctx?: { waitUntil?(promise: Promise<unknown>): void },
  ): Promise<Response> {
    syncEnv(env);
    if (ctx && typeof ctx.waitUntil === "function") {
      setRequestWaitUntil(ctx.waitUntil.bind(ctx));
    }
    if (env.ALICE_DO) {
      const id = env.ALICE_DO.idFromName("global-v1");
      const stub = env.ALICE_DO.get(id, { locationHint: "enam" });
      return await stub.fetch(request);
    }
    return await handleRequest(request);
  },
};

export default workerHandler;

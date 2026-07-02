import { reportActive } from "../../protocol/src/pushClient.ts";
import type { Credentials } from "../../protocol/src/clientApi.ts";

export const startActiveReportingWith = (
  reportActiveFn: (creds: Credentials) => Promise<unknown>,
) =>
(creds: Credentials) => {
  const fire = () => reportActiveFn(creds).catch(() => {});
  const onVisibility = () => {
    if (globalThis.document?.visibilityState !== "visible") return;
    fire();
  };
  fire();
  const id = setInterval(fire, 30_000);
  globalThis.document?.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(id);
    globalThis.document?.removeEventListener("visibilitychange", onVisibility);
  };
};

export const startActiveReporting = startActiveReportingWith(reportActive);

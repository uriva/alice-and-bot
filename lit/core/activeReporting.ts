import { reportActive } from "../../protocol/src/pushClient.ts";
import type { Credentials } from "../../protocol/src/clientApi.ts";

export const startActiveReportingWith = (
  _reportActiveFn: (creds: Credentials) => Promise<unknown>,
) =>
(_creds: Credentials) =>
() => {};

export const startActiveReporting = startActiveReportingWith(reportActive);

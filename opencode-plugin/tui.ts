// deno-lint-ignore-file
type TuiAction = "openHelp" | "openSessions" | "openThemes" | "openModels";

export const callFirstAvailable = async (
  calls: Array<() => Promise<unknown>>,
) => {
  let lastError: unknown;
  for (const call of calls) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const tuiOf = ({ client }: { client: any }) => client?.tui;

const hasTuiMethod = ({ client, name }: { client: any; name: string }) =>
  typeof tuiOf({ client })?.[name] === "function";

export const executeTuiAction = async (
  { client, action }: { client: any; action: TuiAction },
) => {
  if (!hasTuiMethod({ client, name: action })) return false;
  const tui = tuiOf({ client });
  await callFirstAvailable([
    () => tui[action](),
    () => tui[action]({}),
  ]);
  return true;
};

export const executeTuiCommand = async (
  { client, command }: { client: any; command: string },
) => {
  if (!hasTuiMethod({ client, name: "executeCommand" })) return false;
  const tui = tuiOf({ client });
  await callFirstAvailable([
    () => tui.executeCommand({ command }),
    () => tui.executeCommand({ body: { command } }),
  ]);
  return true;
};

export const executeSessionCommand = async (
  { client, sessionId, command, argumentsText }: {
    client: any;
    sessionId: string;
    command: string;
    argumentsText: string;
  },
) => {
  const session = client?.session;
  if (typeof session?.command !== "function") return false;
  await callFirstAvailable([
    () =>
      session.command({
        sessionID: sessionId,
        command,
        arguments: argumentsText,
      }),
    () =>
      session.command({
        path: { id: sessionId },
        body: { command, arguments: argumentsText },
      }),
  ]);
  return true;
};

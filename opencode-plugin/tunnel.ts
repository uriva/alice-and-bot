import { spawn } from "node:child_process";

export function startTunnel(
  port: number,
): Promise<
  {
    url: string;
    close: () => void;
    on: (event: string, cb: () => void) => void;
  }
> {
  return new Promise((resolve, reject) => {
    const ssh = spawn("ssh", [
      "-R",
      `80:localhost:${port}`,
      "-o",
      "StrictHostKeyChecking=no",
      "nokey@localhost.run",
      "-T",
    ]);

    let resolved = false;
    let url = "";

    const callbacks: Record<string, (() => void)[]> = { close: [], error: [] };

    ssh.stdout.on("data", (data) => {
      const str = data.toString();
      const match = str.match(/https:\/\/[a-zA-Z0-9.-]+\.lhr\.life/);
      if (match && !resolved) {
        resolved = true;
        url = match[0];
        resolve({
          url,
          close: () => ssh.kill(),
          on: (event: string, cb: () => void) => {
            if (callbacks[event]) callbacks[event].push(cb);
          },
        });
      }
    });

    ssh.on("close", () => {
      callbacks.close?.forEach((cb) => cb());
    });

    ssh.on("error", () => {
      callbacks.error?.forEach((cb) => cb());
    });

    setTimeout(() => {
      if (!resolved) {
        ssh.kill();
        reject(new Error("Timeout waiting for localhost.run url"));
      }
    }, 15000);
  });
}

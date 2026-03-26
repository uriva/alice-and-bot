import localtunnel from "localtunnel";

export async function startTunnel(
  port: number,
): Promise<{
  url: string;
  close: () => void;
  on: (event: string, cb: (err?: Error) => void) => void;
}> {
  const tunnel = await localtunnel({ port });

  return {
    url: tunnel.url,
    close: () => tunnel.close(),
    on: (event: string, cb: (err?: Error) => void) => {
      tunnel.on(event, cb);
    },
  };
}

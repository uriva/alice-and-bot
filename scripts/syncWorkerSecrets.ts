// deno-lint-ignore-file
const secretKeys = [
  "BITCOIN_XPUB",
  "GCP_CREDENTIALS",
  "INSTANT_ADMIN_TOKEN",
  "VAPID_PRIVATE_KEY",
  "VAPID_PUBLIC_KEY",
];

const secrets: Record<string, string> = {};
secretKeys.forEach((key) => {
  const val = Deno.env.get(key);
  if (val && val.trim().length > 0) {
    secrets[key] = val;
  }
});

if (Object.keys(secrets).length === 0) {
  console.log("No secrets to sync.");
  Deno.exit(0);
}

const tmpFile = await Deno.makeTempFile({ suffix: ".json" });
try {
  await Deno.writeTextFile(tmpFile, JSON.stringify(secrets));
  console.log(
    `Syncing ${Object.keys(secrets).length} secrets to Cloudflare...`,
  );
  const cmd = new Deno.Command("npx", {
    args: ["wrangler", "secret", "bulk", tmpFile],
  });
  const res = await cmd.output();
  if (!res.success) {
    console.error(new TextDecoder().decode(res.stderr));
    Deno.exit(res.code);
  }
  console.log(new TextDecoder().decode(res.stdout));
} finally {
  await Deno.remove(tmpFile).catch(() => {});
}

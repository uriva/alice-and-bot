const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const hexGroupPattern = /^[0-9a-f]{1,4}$/;

export const parseIpv4Octets = (
  host: string,
): [number, number, number, number] | null => {
  const match = host.match(ipv4Pattern);
  if (!match) return null;
  const octets = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
  ] as [number, number, number, number];
  return octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? octets
    : null;
};

export const isReservedIpv4 = (
  [a, b, c]: [number, number, number, number],
): boolean =>
  a === 0 ||
  a === 10 ||
  (a === 100 && b >= 64 && b <= 127) ||
  a === 127 ||
  (a === 169 && b === 254) ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 0 && (c === 0 || c === 2)) ||
  (a === 192 && b === 168) ||
  (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
  (a === 203 && b === 0 && c === 113) ||
  a >= 224;

const normalizeEmbeddedIpv4InIpv6 = (addr: string): string => {
  const lastColon = addr.lastIndexOf(":");
  if (lastColon === -1) return addr;
  const tail = addr.slice(lastColon + 1);
  const octets = parseIpv4Octets(tail);
  if (!octets) return addr;
  const hi = ((octets[0] << 8) | octets[1]).toString(16);
  const lo = ((octets[2] << 8) | octets[3]).toString(16);
  return `${addr.slice(0, lastColon + 1)}${hi}:${lo}`;
};

const parseHexSegments = (part: string): number[] | null => {
  if (part === "") return [];
  const pieces = part.split(":");
  if (!pieces.every((p) => hexGroupPattern.test(p))) return null;
  return pieces.map((p) => Number.parseInt(p, 16));
};

export const expandIpv6Groups = (rawIpv6: string): number[] | null => {
  const stripped = rawIpv6.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (!stripped) return null;
  const normalized = normalizeEmbeddedIpv4InIpv6(stripped);
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  if (halves.length === 1) {
    const groups = parseHexSegments(halves[0]);
    return groups && groups.length === 8 ? groups : null;
  }
  const left = parseHexSegments(halves[0]);
  const right = parseHexSegments(halves[1]);
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array<number>(missing).fill(0), ...right];
};

const octetsFromTwoGroups = (
  hi: number,
  lo: number,
): [number, number, number, number] => [
  (hi >> 8) & 0xff,
  hi & 0xff,
  (lo >> 8) & 0xff,
  lo & 0xff,
];

export const isReservedIpv6 = (groups: number[]): boolean => {
  if (groups.every((g) => g === 0)) return true;
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true;
  if (
    groups.slice(0, 5).every((g) => g === 0) &&
    (groups[5] === 0xffff || groups[5] === 0)
  ) {
    return isReservedIpv4(octetsFromTwoGroups(groups[6], groups[7]));
  }
  if (
    groups.slice(0, 4).every((g) => g === 0) &&
    groups[4] === 0xffff &&
    groups[5] === 0
  ) {
    return isReservedIpv4(octetsFromTwoGroups(groups[6], groups[7]));
  }
  if (groups[0] === 0x0064 && groups[1] === 0xff9b) {
    return isReservedIpv4(octetsFromTwoGroups(groups[6], groups[7]));
  }
  if (groups[0] === 0x2002) {
    return isReservedIpv4(octetsFromTwoGroups(groups[1], groups[2]));
  }
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xffc0) === 0xfec0) return true;
  if ((groups[0] & 0xff00) === 0xff00) return true;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
  if (groups[0] === 0x0100 && groups.slice(1, 4).every((g) => g === 0)) {
    return true;
  }
  return false;
};

const isBlockedHostname = (host: string): boolean =>
  host === "localhost" ||
  host.endsWith(".localhost") ||
  host.endsWith(".local") ||
  host.endsWith(".internal") ||
  host === "ip6-localhost" ||
  host === "ip6-loopback" ||
  host === "metadata" ||
  host === "metadata.google.internal" ||
  host === "instance-data";

const isLocalDevAllowed = (): boolean =>
  typeof Deno !== "undefined" && Deno.env.get("ALLOW_LOCAL_WEBHOOKS") === "1";

const isLoopbackHost = (host: string): boolean =>
  host === "localhost" || host === "127.0.0.1" || host === "[::1]";

export const isSafeWebhookUrl = (
  url: string,
  options?: { allowEmpty?: boolean },
): boolean => {
  if (options?.allowEmpty && url === "") return true;
  if (!url || /\p{Cc}/u.test(url)) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (!host) return false;
    if (
      isLocalDevAllowed() &&
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      isLoopbackHost(host)
    ) {
      return true;
    }
    if (parsed.protocol !== "https:") return false;
    if (isBlockedHostname(host)) return false;
    if (host.startsWith("[")) {
      const groups = expandIpv6Groups(host);
      return groups !== null && !isReservedIpv6(groups);
    }
    const ipv4 = parseIpv4Octets(host);
    if (ipv4) return !isReservedIpv4(ipv4);
    if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return false;
    return host.includes(".");
  } catch {
    return false;
  }
};

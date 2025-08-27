const aliasPattern = /^[a-z0-9_]{1,15}$/;

export const normalizeAlias = (alias: string): string =>
  alias.trim().toLowerCase().replace(/\s+/g, "").slice(0, 15);

export const isValidAlias = (alias: string): boolean =>
  alias === normalizeAlias(alias) && aliasPattern.test(alias);

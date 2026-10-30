// Human-looking local parts: pre-warmed sending mailboxes should read like people.
const LOCAL_PARTS = [
  "alex", "blake", "casey", "dana", "eli", "finley", "gray", "harper", "indy", "jordan",
  "kai", "logan", "morgan", "noel", "oakley", "parker", "quinn", "reese", "sage", "taylor",
  "uma", "val", "wren", "xen", "yael",
] as const;

/**
 * Deterministic addresses for an order: the same (domain, count) always yields
 * the same list, so a retry never invents new mailboxes.
 *   alex@acme.com … yael@acme.com, alex2@acme.com … (up to 50)
 */
export function mailboxAddresses(domain: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const base = LOCAL_PARTS[i % LOCAL_PARTS.length];
    const round = Math.floor(i / LOCAL_PARTS.length);
    return `${base}${round === 0 ? "" : round + 1}@${domain}`;
  });
}

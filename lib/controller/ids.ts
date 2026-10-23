// exp_001 → exp_002, keeping the zero padding. The experiment chain is
// linear (one child per parent), so the next ID follows from the parent's.
export function nextSequentialId(id: string): string {
  const match = /^(.*?)(\d+)$/.exec(id);

  if (!match) {
    throw new Error(`ID ${id} has no numeric suffix.`);
  }

  const [, prefix, digits] = match;
  return `${prefix}${String(Number(digits) + 1).padStart(digits.length, "0")}`;
}

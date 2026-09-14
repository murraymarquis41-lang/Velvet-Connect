export function isAtLeast18(dateOfBirth: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(birthDate.valueOf()) || birthDate > now) return false;
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
  return birthDate <= cutoff;
}

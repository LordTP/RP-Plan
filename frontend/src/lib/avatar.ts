/**
 * User avatar helpers — picks a stable colour per username so the same user
 * is always the same colour across surfaces, and returns 1–2 initials from a
 * full name or username for the small badge.
 */

const PALETTE = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-violet-600',
  'bg-cyan-600',
  'bg-fuchsia-600',
  'bg-orange-600',
  'bg-teal-600',
  'bg-indigo-600',
  'bg-pink-600',
  'bg-lime-700',
] as const;

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function avatarColour(usernameOrName: string | null | undefined): string {
  if (!usernameOrName) return 'bg-gray-500';
  return PALETTE[hash(usernameOrName) % PALETTE.length];
}

export function avatarInitials(fullNameOrUsername: string | null | undefined): string {
  if (!fullNameOrUsername) return '?';
  const trimmed = fullNameOrUsername.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  // Single word (likely a username) — take first two characters.
  return trimmed.slice(0, 2).toUpperCase();
}

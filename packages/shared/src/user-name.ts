export function formatUserDisplayName(user: {
  firstName: string;
  lastName: string;
}): string {
  return [user.firstName.trim(), user.lastName.trim()].filter(Boolean).join(' ');
}

export function splitDisplayName(displayName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = displayName.trim();
  const space = trimmed.indexOf(' ');
  if (space <= 0) {
    return { firstName: trimmed, lastName: '' };
  }
  return {
    firstName: trimmed.slice(0, space).trim(),
    lastName: trimmed.slice(space + 1).trim(),
  };
}

export function isValidPersonName(name: string): boolean {
  return name.trim().length >= 1;
}

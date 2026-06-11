export function formatUserDisplayName(user: {
  firstName: string;
  lastName: string;
}): string {
  return [user.firstName.trim(), user.lastName.trim()].filter(Boolean).join(' ');
}

export function isValidPersonName(name: string): boolean {
  return name.trim().length >= 1;
}

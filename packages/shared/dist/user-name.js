export function formatUserDisplayName(user) {
    return [user.firstName.trim(), user.lastName.trim()].filter(Boolean).join(' ');
}
export function splitDisplayName(displayName) {
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
export function isValidPersonName(name) {
    return name.trim().length >= 1;
}
//# sourceMappingURL=user-name.js.map
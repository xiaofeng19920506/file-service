export type UserContactFields = {
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
};

export type UserContactInput = {
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  country?: string;
};

export function normalizeUserContact(input: UserContactInput): UserContactFields {
  return {
    phone: input.phone?.trim() ?? '',
    addressLine1: input.addressLine1?.trim() ?? '',
    addressLine2: input.addressLine2?.trim() ?? '',
    city: input.city?.trim() ?? '',
    stateProvince: input.stateProvince?.trim() ?? '',
    postalCode: input.postalCode?.trim() ?? '',
    country: input.country?.trim() ?? '',
  };
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function isValidAddressLine(line: string): boolean {
  return line.trim().length >= 3;
}

export function isValidCity(city: string): boolean {
  return city.trim().length >= 2;
}

export function isValidStateProvince(value: string): boolean {
  return value.trim().length >= 2;
}

export function isValidPostalCode(code: string): boolean {
  return code.trim().length >= 3;
}

export function validateUserContact(input: UserContactInput): string | null {
  const contact = normalizeUserContact(input);
  if (!isValidPhone(contact.phone)) return 'invalid_phone';
  if (!isValidAddressLine(contact.addressLine1)) return 'invalid_address';
  if (!isValidCity(contact.city)) return 'invalid_city';
  if (!isValidStateProvince(contact.stateProvince)) return 'invalid_state_province';
  if (!isValidPostalCode(contact.postalCode)) return 'invalid_postal_code';
  return null;
}

export function formatUserAddress(contact: UserContactFields): string {
  const lines = [
    contact.addressLine1,
    contact.addressLine2,
    [contact.city, contact.stateProvince, contact.postalCode].filter(Boolean).join(', '),
    contact.country,
  ].filter((line) => line.trim().length > 0);
  return lines.join('\n');
}

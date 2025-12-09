export function normalizePhoneInput(value: string, maxDigits = 15): string {
  if (!value) return '';
  const trimmed = value.replace(/\s+/g, '');
  const hasPlusPrefix = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  const limitedDigits = digitsOnly.slice(0, maxDigits);
  if (!limitedDigits) return hasPlusPrefix ? '+' : '';
  return `${hasPlusPrefix ? '+' : ''}${limitedDigits}`;
}

export function isValidPhoneLength(value: string, minDigits = 10, maxDigits = 15): boolean {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return true; // allow empty optional phone numbers
  return digits.length >= minDigits && digits.length <= maxDigits;
}

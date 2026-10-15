/**
 * Israeli mobile numbers.
 *
 * The phone number is the trainee's login, so it must reach Supabase in one canonical shape: E.164
 * (`+9725XXXXXXXX`). Everything a person might reasonably type is accepted and converted:
 * `050-123-4567`, `0501234567`, `50 123 4567`, `+972 50 123 4567`, `972501234567`, `00972501234567`,
 * `+972 (0) 50-123-4567`.
 */

const NATIONAL_MOBILE = /^5\d{8}$/; // 5X + 7 digits (the leading 0 is dropped)

/** Returns the number in E.164 form, or `null` when it is not a plausible Israeli mobile number. */
export function normalizeIsraeliMobile(raw: string): string | null {
  const text = raw.trim();
  // Only digits and the usual separators; a "+" may only open the number.
  if (!/^\+?[\d\s\-().]+$/.test(text)) return null;

  let digits = text.replace(/\D/g, '');
  const international = text.startsWith('+') || digits.startsWith('00') || (digits.startsWith('972') && digits.length >= 11);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (international) {
    if (!digits.startsWith('972')) return null; // somebody else's country code
    digits = digits.slice(3);
  }
  if (digits.startsWith('0')) digits = digits.slice(1); // "+972 (0) 50..." and the national "050..."

  return NATIONAL_MOBILE.test(digits) ? `+972${digits}` : null;
}

/** `+972501234567` -> `050-123-4567`. Anything that is not an Israeli E.164 mobile number is returned unchanged. */
export function formatIsraeliPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const match = /^\+972(5\d)(\d{3})(\d{4})$/.exec(phone.trim());
  return match ? `0${match[1]}-${match[2]}-${match[3]}` : phone;
}

/**
 * Post-login / post-confirmation destinations must stay on this site.
 *
 * Browsers strip ASCII tab and newline characters while parsing a URL, so "/\t/evil.com" in a Location
 * header is interpreted as "//evil.com" (protocol-relative, i.e. another site). Control characters are
 * therefore rejected outright, and the value is also resolved against a dummy origin as a final check.
 */
const DUMMY_ORIGIN = 'http://internal.invalid';
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function safeNext(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value === '') return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes('\\') || CONTROL_CHARS.test(value)) return fallback;
  try {
    if (new URL(value, DUMMY_ORIGIN).origin !== DUMMY_ORIGIN) return fallback;
  } catch {
    return fallback;
  }
  return value;
}

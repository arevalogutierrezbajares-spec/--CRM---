/** Password policy: 6–10 characters, letters and/or digits (no symbols). */
export const PASSWORD_RULE = "Use 6–10 characters — letters and numbers.";

const PASSWORD_RE = /^[A-Za-z0-9]{6,10}$/;

export function isValidPassword(password: string): boolean {
  return PASSWORD_RE.test(password);
}

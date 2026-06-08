export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function splitEmails(value: string): string[] {
  return value
    .split(/[,\n;]/g)
    .map(normalizeEmail)
    .filter(Boolean);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function previewText(value: string, max = 180): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trim()}…`;
}

export function initials(nameOrEmail: string): string {
  const source = nameOrEmail.includes("@") ? nameOrEmail.split("@")[0] : nameOrEmail;
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

export function relativeTime(value: Date | string): string {
  const date = new Date(value);
  const delta = Math.floor((Date.now() - date.getTime()) / 60000);
  if (delta < 1) return "now";
  if (delta < 60) return `${delta}m`;
  const hours = Math.floor(delta / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

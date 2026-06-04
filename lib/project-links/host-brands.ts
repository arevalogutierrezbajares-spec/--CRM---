/**
 * FR-DOC-3 + FR-DOC-10 — brand display table for hostnames we know.
 * Used for: (1) auto-filling the label field with a friendly brand name when
 * a URL is pasted; (2) rendering a per-row brand chip on the project page.
 *
 * If a hostname is not listed, fall back to the bare hostname (FR-DOC-10).
 */

export type BrandEntry = {
  pattern: RegExp;
  brand: string;
};

export const HOST_BRANDS: BrandEntry[] = [
  // Google
  { pattern: /(^|\.)docs\.google\.com$/i, brand: "Google Docs" },
  { pattern: /(^|\.)sheets\.google\.com$/i, brand: "Google Sheets" },
  { pattern: /(^|\.)slides\.google\.com$/i, brand: "Google Slides" },
  { pattern: /(^|\.)drive\.google\.com$/i, brand: "Google Drive" },

  // Microsoft 365
  { pattern: /(^|\.)onedrive\.live\.com$/i, brand: "OneDrive" },
  { pattern: /(^|\.)sharepoint\.com$/i, brand: "SharePoint" },
  { pattern: /(^|\.)office\.com$/i, brand: "Office 365" },
  { pattern: /(^|\.)office365\.com$/i, brand: "Office 365" },

  // Design
  { pattern: /(^|\.)figma\.com$/i, brand: "Figma" },
  { pattern: /(^|\.)canva\.com$/i, brand: "Canva" },
  { pattern: /(^|\.)miro\.com$/i, brand: "Miro" },
  { pattern: /(^|\.)sketch\.com$/i, brand: "Sketch" },
  { pattern: /(^|\.)framer\.com$/i, brand: "Framer" },

  // Tech
  { pattern: /(^|\.)github\.com$/i, brand: "GitHub" },
  { pattern: /(^|\.)gitlab\.com$/i, brand: "GitLab" },
  { pattern: /(^|\.)bitbucket\.org$/i, brand: "Bitbucket" },
  { pattern: /(^|\.)vercel\.app$/i, brand: "Vercel" },
  { pattern: /(^|\.)vercel\.com$/i, brand: "Vercel" },
  { pattern: /(^|\.)netlify\.app$/i, brand: "Netlify" },
  { pattern: /(^|\.)supabase\.co$/i, brand: "Supabase" },
  { pattern: /(^|\.)supabase\.com$/i, brand: "Supabase" },
  { pattern: /(^|\.)linear\.app$/i, brand: "Linear" },
  { pattern: /(^|\.)npmjs\.com$/i, brand: "npm" },

  // Ops
  { pattern: /(^|\.)notion\.so$/i, brand: "Notion" },
  { pattern: /(^|\.)notion\.site$/i, brand: "Notion" },
  { pattern: /(^|\.)coda\.io$/i, brand: "Coda" },
  { pattern: /(^|\.)dropboxpaper\.com$/i, brand: "Dropbox Paper" },
  { pattern: /(^|\.)paper\.dropbox\.com$/i, brand: "Dropbox Paper" },
  { pattern: /(^|\.)airtable\.com$/i, brand: "Airtable" },
  { pattern: /(^|\.)clickup\.com$/i, brand: "ClickUp" },
  { pattern: /(^|\.)asana\.com$/i, brand: "Asana" },
  { pattern: /(^|\.)monday\.com$/i, brand: "monday" },
  { pattern: /(^|\.)trello\.com$/i, brand: "Trello" },
  { pattern: /(^|\.)calendly\.com$/i, brand: "Calendly" },

  // Finance
  { pattern: /(^|\.)stripe\.com$/i, brand: "Stripe" },
  { pattern: /(^|\.)quickbooks\.intuit\.com$/i, brand: "QuickBooks" },
  { pattern: /(^|\.)xero\.com$/i, brand: "Xero" },
  { pattern: /(^|\.)mercury\.com$/i, brand: "Mercury" },
  { pattern: /(^|\.)brex\.com$/i, brand: "Brex" },
  { pattern: /(^|\.)ramp\.com$/i, brand: "Ramp" },

  // Marketing
  { pattern: /(^|\.)instagram\.com$/i, brand: "Instagram" },
  { pattern: /(^|\.)tiktok\.com$/i, brand: "TikTok" },
  { pattern: /(^|\.)youtube\.com$/i, brand: "YouTube" },
  { pattern: /(^|\.)youtu\.be$/i, brand: "YouTube" },
  { pattern: /(^|\.)twitter\.com$/i, brand: "Twitter" },
  { pattern: /(^|\.)x\.com$/i, brand: "X" },
  { pattern: /(^|\.)linkedin\.com$/i, brand: "LinkedIn" },
  { pattern: /(^|\.)facebook\.com$/i, brand: "Facebook" },
  { pattern: /(^|\.)threads\.net$/i, brand: "Threads" },
  { pattern: /(^|\.)mailchimp\.com$/i, brand: "Mailchimp" },
  { pattern: /(^|\.)hubspot\.com$/i, brand: "HubSpot" },
];

/** Returns the brand display name for a URL's hostname, or the bare hostname. */
export function brandForUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const { pattern, brand } of HOST_BRANDS) {
      if (pattern.test(host)) return brand;
    }
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

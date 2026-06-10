import { Mail, MessageCircle, Phone, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

type Channel = {
  kind: string;
  value: string;
  isPrimary?: boolean | null;
};

function pickPrimary(channels: Channel[], kind: string): string | null {
  const matching = channels.filter((c) => c.kind === kind);
  if (matching.length === 0) return null;
  return (matching.find((c) => c.isPrimary) ?? matching[0]).value;
}

function digitsOnly(v: string): string {
  return v.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function igHandle(v: string): string {
  return v.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "");
}

export function ReachIcons({ channels }: { channels: Channel[] }) {
  const whatsapp = pickPrimary(channels, "whatsapp");
  const phone = pickPrimary(channels, "phone");
  const email = pickPrimary(channels, "email");
  const instagram = pickPrimary(channels, "instagram");

  const items: Array<{
    key: string;
    icon: React.ComponentType<{ className?: string }>;
    href: string | null;
    label: string;
    activeClass: string;
  }> = [
    {
      key: "whatsapp",
      icon: MessageCircle,
      href: whatsapp ? `https://wa.me/${digitsOnly(whatsapp)}` : null,
      label: whatsapp ? `WhatsApp ${whatsapp}` : "No WhatsApp",
      activeClass: "text-green-600 hover:text-green-700",
    },
    {
      key: "phone",
      icon: Phone,
      href: phone ? `tel:${phone}` : null,
      label: phone ? `Call ${phone}` : "No phone",
      activeClass: "text-blue-600 hover:text-blue-700",
    },
    {
      key: "email",
      icon: Mail,
      href: email ? `mailto:${email}` : null,
      label: email ? `Email ${email}` : "No email",
      activeClass: "text-amber-600 hover:text-amber-700",
    },
    {
      key: "instagram",
      icon: Camera,
      href: instagram ? `https://instagram.com/${igHandle(instagram)}` : null,
      label: instagram ? `Instagram @${igHandle(instagram)}` : "No Instagram",
      activeClass: "text-pink-600 hover:text-pink-700",
    },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {items.map(({ key, icon: Icon, href, label, activeClass }) => {
        const hasValue = href !== null;
        const className = cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
          hasValue ? activeClass : "text-[var(--muted-foreground)]/25",
        );
        if (hasValue) {
          return (
            <a
              key={key}
              href={href}
              title={label}
              aria-label={label}
              target={key === "phone" ? undefined : "_blank"}
              rel="noopener noreferrer"
              className={className}
            >
              <Icon className="h-4 w-4" />
            </a>
          );
        }
        return (
          <span key={key} title={label} aria-label={label} className={className}>
            <Icon className="h-4 w-4" />
          </span>
        );
      })}
    </div>
  );
}

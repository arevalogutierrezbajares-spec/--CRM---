"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ROOM_LOCALE_OPTIONS } from "@/lib/partner-room-i18n";

/**
 * The room language picker. Options come straight from ROOM_LOCALE_OPTIONS, so
 * enabling a new language is a one-line change there (+ its dictionary) — this
 * dropdown, and every room that uses it, pick it up automatically. Renders a
 * flag + the language's own native name, the way a language switcher should.
 */
export function LanguageSelect({
  id = "room-language",
  value,
  onChange,
  label = "Language",
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const selected =
    ROOM_LOCALE_OPTIONS.find((o) => o.value === value) ?? ROOM_LOCALE_OPTIONS[0];

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="text-base leading-none">
                {selected.flag}
              </span>
              {selected.label}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ROOM_LOCALE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="text-base leading-none">
                  {option.flag}
                </span>
                <span>{option.label}</span>
                {option.englishName !== option.label && (
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {option.englishName}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "bg-[var(--card)] text-[var(--card-foreground)] border border-[var(--border)] shadow-md rounded-md",
          description: "text-[var(--muted-foreground)]",
        },
      }}
    />
  );
}

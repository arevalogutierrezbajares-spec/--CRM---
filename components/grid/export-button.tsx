"use client";

import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ExportButton({
  endpoint,
  label = "Export CSV",
}: {
  endpoint: string;
  label?: string;
}) {
  const sp = useSearchParams();
  const href = `${endpoint}${sp.size ? `?${sp.toString()}` : ""}`;
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} download>
        <Download className="h-4 w-4" /> {label}
      </a>
    </Button>
  );
}

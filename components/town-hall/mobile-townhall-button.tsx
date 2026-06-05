import Link from "next/link";
import { Megaphone } from "lucide-react";

/** Town Hall entry for screens below lg, where the rail chat panel is hidden. */
export function MobileTownHallButton() {
  return (
    <Link
      href="/town-hall"
      aria-label="Town Hall"
      title="Town Hall"
      className="grid h-[40px] w-[40px] place-items-center rounded-md text-text-secondary transition-colors hover:bg-surface hover:text-text-primary lg:hidden"
    >
      <Megaphone size={18} />
    </Link>
  );
}

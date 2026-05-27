import { ReactNode } from "react";

interface RightColumnProps {
  children: ReactNode;
}

export function RightColumn({ children }: RightColumnProps) {
  return (
    <aside className="hidden xl:flex w-[280px] shrink-0 flex-col gap-2.5">
      {children}
    </aside>
  );
}

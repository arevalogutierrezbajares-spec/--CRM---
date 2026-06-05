import { ReactNode } from "react";

interface RightColumnProps {
  children: ReactNode;
}

export function RightColumn({ children }: RightColumnProps) {
  return (
    <aside className="row-span-1 hidden min-h-0 w-full shrink-0 flex-col gap-2.5 lg:flex lg:sticky lg:top-16 lg:max-h-[calc(100svh-5rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1">
      {children}
    </aside>
  );
}

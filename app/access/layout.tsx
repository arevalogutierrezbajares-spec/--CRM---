import { MotionProvider } from "@/components/motion-provider";

/**
 * The public partner-room route lives outside the (app) group, so it doesn't
 * inherit the app-wide MotionProvider. Wrap it here so the sign-in animations
 * honor `prefers-reduced-motion` (WCAG 2.3.3) for external visitors too.
 */
export default function AccessLayout({ children }: { children: React.ReactNode }) {
  return <MotionProvider>{children}</MotionProvider>;
}

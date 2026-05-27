import type { Metadata } from "next";
import { CaneyLanding } from "./caney-landing";

export const metadata: Metadata = {
  title: "X . JEAV . TIGR",
  description: "Access portal",
};

// Server component shell. All interactivity lives in the client component.
export default function LoginPage() {
  return <CaneyLanding />;
}

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Public static media (incl. the pre-rendered /greetings/*.mp3 greeting
    // clips) bypasses auth — same as images — so the <audio> never 307s to login.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a)$).*)",
  ],
};

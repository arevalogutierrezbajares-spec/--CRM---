import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Public static media (greeting/broadcast audio + the WIN / Angel Falls
    // videos) bypasses auth — same as images — so <audio>/<video> never 307s to
    // login.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a|mp4|webm)$).*)",
  ],
};

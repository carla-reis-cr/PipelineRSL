import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) {
      const to = new URL("/login", url.origin);
      to.searchParams.set("erro", error.message);
      return NextResponse.redirect(to);
    }
  }
  return NextResponse.redirect(new URL("/", url.origin));
}

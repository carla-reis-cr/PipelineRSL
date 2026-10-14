import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Valida o link do e-mail no servidor (token_hash), sem depender do navegador que pediu o link. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") || "email") as EmailOtpType;
  if (tokenHash) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL("/", url.origin));
    const to = new URL("/login", url.origin);
    to.searchParams.set("erro", error.message);
    return NextResponse.redirect(to);
  }
  return NextResponse.redirect(new URL("/login", url.origin));
}

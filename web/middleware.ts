import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/** Renova a sessão do Supabase a cada requisição e manda para /login quem não entrou. */
export async function middleware(req: NextRequest) {
  // Se o Supabase devolver o código para outra página (ex.: /login?code=...), encaminha para o callback.
  const code = req.nextUrl.searchParams.get("code");
  if (code && !req.nextUrl.pathname.startsWith("/auth")) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.search = `?code=${encodeURIComponent(code)}`;
    return NextResponse.redirect(url);
  }
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  const open = path.startsWith("/login") || path.startsWith("/auth");
  if (!data.user && !open) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

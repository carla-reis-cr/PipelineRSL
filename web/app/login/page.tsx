"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "create" | "forgot">("login");
  const creating = mode === "create";
  const forgot = mode === "forgot";
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const erro = new URLSearchParams(location.search).get("erro");
    if (erro) setErr(`Não foi possível entrar: ${erro}`);
  }, []);

  function go(m: typeof mode) { setMode(m); setErr(null); setMsg(null); }

  function translate(message: string) {
    if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
    if (/email not confirmed/i.test(message)) return "E-mail ainda não confirmado.";
    if (/already registered/i.test(message)) return "Este e-mail já tem conta. Use “Entrar”.";
    if (/at least \d+ characters/i.test(message)) return "A senha precisa ter pelo menos 6 caracteres.";
    if (/rate limit|after \d+ seconds/i.test(message)) return "Muitos pedidos de e-mail. Aguarde um pouco e tente de novo.";
    return message;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setErr(null);
    setMsg(null);
    setSending(true);
    try {
      const sb = supabaseBrowser();
      if (forgot) {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/redefinir-senha` });
        if (error) return setErr(translate(error.message));
        return setMsg("Se este e-mail tiver conta, enviamos um link para criar uma nova senha. Abra o link neste mesmo navegador.");
      }
      if (creating) {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) return setErr(translate(error.message));
        if (!data.session) return setMsg("Conta criada. Confirme o e-mail para entrar.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return setErr(translate(error.message));
      }
      location.assign("/");
    } catch {
      setErr("Não foi possível falar com o servidor. Tente novamente em instantes.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={{ maxWidth: 420 }}>
      <h1>Pipeline RSL</h1>
      <form className="panel" onSubmit={submit}>
        <label>E-mail<br /><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }} /></label>
        {!forgot && <label>Senha<br /><input type="password" required minLength={6} autoComplete={creating ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%" }} /></label>}
        <button className="btn" type="submit" disabled={sending}>{sending ? "Aguarde…" : forgot ? "Enviar link de redefinição" : creating ? "Criar conta" : "Entrar"}</button>
        <p className="muted">
          {mode === "login" && <><a href="#" onClick={(e) => { e.preventDefault(); go("forgot"); }}>Esqueci minha senha</a> · </>}
          {mode === "login" ? "Ainda não tem conta? " : creating ? "Já tem conta? " : "Lembrou a senha? "}
          <a href="#" onClick={(e) => { e.preventDefault(); go(mode === "login" ? "create" : "login"); }}>{mode === "login" ? "Criar conta" : "Entrar"}</a>
        </p>
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="err">{err}</p>}
      </form>
    </main>
  );
}

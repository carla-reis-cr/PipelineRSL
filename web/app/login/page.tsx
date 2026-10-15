"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const erro = new URLSearchParams(location.search).get("erro");
    if (erro) setErr(`Não foi possível entrar: ${erro}`);
  }, []);

  function translate(message: string) {
    if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
    if (/email not confirmed/i.test(message)) return "E-mail ainda não confirmado.";
    if (/already registered/i.test(message)) return "Este e-mail já tem conta. Use “Entrar”.";
    if (/at least \d+ characters/i.test(message)) return "A senha precisa ter pelo menos 6 caracteres.";
    if (/rate limit/i.test(message)) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
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
        <label>Senha<br /><input type="password" required minLength={6} autoComplete={creating ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%" }} /></label>
        <button className="btn" type="submit" disabled={sending}>{sending ? "Aguarde…" : creating ? "Criar conta" : "Entrar"}</button>
        <p className="muted">
          {creating ? "Já tem conta? " : "Ainda não tem conta? "}
          <a href="#" onClick={(e) => { e.preventDefault(); setCreating(!creating); setErr(null); setMsg(null); }}>{creating ? "Entrar" : "Criar conta"}</a>
        </p>
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="err">{err}</p>}
      </form>
    </main>
  );
}

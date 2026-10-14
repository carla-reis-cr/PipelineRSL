"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const COOLDOWN = 60;

export default function Login() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    const erro = new URLSearchParams(location.search).get("erro");
    if (erro) setErr(`Não foi possível entrar: ${erro}. Peça um novo link e abra-o no mesmo navegador e no mesmo endereço (${location.host}).`);
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (sending || wait > 0) return;
    setErr(null);
    setMsg(null);
    setSending(true);
    try {
      const { error } = await supabaseBrowser().auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
      if (error) {
        setErr(error.message);
        const m = /after (\d+) seconds/.exec(error.message);
        if (m) setWait(Number(m[1]));
      } else {
        setMsg("Enviamos um link de acesso para o seu e-mail. Abra o link neste mesmo navegador.");
        setWait(COOLDOWN);
      }
    } catch {
      setErr("Não foi possível falar com o servidor. Tente novamente em instantes.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={{ maxWidth: 420 }}>
      <h1>Pipeline RSL</h1>
      <form className="panel" onSubmit={send}>
        <label>E-mail<br /><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }} /></label>
        <button className="btn" type="submit" disabled={sending || wait > 0}>
          {sending ? "Enviando…" : wait > 0 ? `Aguarde ${wait}s para reenviar` : "Receber link de acesso"}
        </button>
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="err">{err}</p>}
      </form>
    </main>
  );
}

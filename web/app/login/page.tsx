"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    if (error) setErr(error.message);
    else setMsg("Enviamos um link de acesso para o seu e-mail.");
  }
  return (
    <main style={{ maxWidth: 420 }}>
      <h1>Bancada PRISMA</h1>
      <form className="panel" onSubmit={send}>
        <label>E-mail<br /><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }} /></label>
        <button className="btn" type="submit">Receber link de acesso</button>
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="err">{err}</p>}
      </form>
    </main>
  );
}

"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function RedefinirSenha() {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setErr(null);
    if (password.length < 6) return setErr("A senha precisa ter pelo menos 6 caracteres.");
    if (password !== again) return setErr("As senhas não são iguais.");
    setSaving(true);
    try {
      const { error } = await supabaseBrowser().auth.updateUser({ password });
      if (error) return setErr(/different from the old/i.test(error.message) ? "Escolha uma senha diferente da anterior." : error.message);
      location.assign("/");
    } catch {
      setErr("Não foi possível falar com o servidor. Tente novamente em instantes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 420 }}>
      <h1>Nova senha</h1>
      <form className="panel" onSubmit={submit}>
        <label>Nova senha<br /><input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%" }} /></label>
        <label>Repita a nova senha<br /><input type="password" required minLength={6} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} style={{ width: "100%" }} /></label>
        <button className="btn" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar nova senha"}</button>
        <p className="muted">Se chegou aqui sem usar o link do e-mail, <a href="/login">volte ao login</a>.</p>
        {err && <p className="err">{err}</p>}
      </form>
    </main>
  );
}

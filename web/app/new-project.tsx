"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_PROTOCOL } from "@/lib/defaults";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Protocol } from "@/lib/types";

export default function NewProject() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function create(protocol: Protocol) {
    const { data, error } = await supabaseBrowser().from("projects").insert({ title: protocol.title ?? "", protocol }).select("id").single();
    if (error) throw new Error(error.message);
    router.push(`/projects/${data.id}`);
  }
  async function onBlank() {
    setErr(null);
    try { await create(DEFAULT_PROTOCOL); }
    catch (x) { setErr(x instanceof Error ? x.message : "Não foi possível criar a revisão."); }
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    try {
      const raw = JSON.parse(await file.text());
      await create(raw.protocol ?? raw);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Não foi possível ler o arquivo.");
    }
  }
  return (
    <div className="panel">
      <h2>Nova revisão</h2>
      <div className="row"><button className="btn" onClick={onBlank}>Criar revisão em branco</button><span className="muted">O protocolo é preenchido na própria revisão.</span></div>
      <label className="f">Ou partir de um protocolo.json exportado de outra revisão<input type="file" accept=".json,application/json" onChange={onFile} /></label>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

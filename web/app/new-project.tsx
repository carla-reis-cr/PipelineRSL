"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function NewProject() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    try {
      const raw = JSON.parse(await file.text());
      const protocol = raw.protocol ?? raw;
      const { data, error } = await supabaseBrowser().from("projects").insert({ title: protocol.title ?? "", protocol }).select("id").single();
      if (error) throw new Error(error.message);
      router.push(`/projects/${data.id}`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Não foi possível ler o arquivo.");
    }
  }
  return (
    <div className="panel">
      <h2>Nova revisão</h2>
      <p className="muted">Na Bancada, aba Protocolo, clique em protocolo.json e escolha o arquivo aqui.</p>
      <input type="file" accept=".json,application/json" onChange={onFile} />
      {err && <p className="err">{err}</p>}
    </div>
  );
}

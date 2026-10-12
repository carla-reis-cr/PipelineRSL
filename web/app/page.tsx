import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import NewProject from "./new-project";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sb = await supabaseServer();
  const { data: projects } = await sb.from("projects").select("id,title,updated_at").order("updated_at", { ascending: false });
  return (
    <main>
      <h1>Revisões</h1>
      <div className="panel">
        {projects?.length ? (
          <table><thead><tr><th>Título</th><th>Última alteração</th></tr></thead><tbody>
            {projects.map((p) => (
              <tr key={p.id}><td><Link href={`/projects/${p.id}`}>{p.title || "(sem título)"}</Link></td><td className="mono">{new Date(p.updated_at).toLocaleString("pt-BR")}</td></tr>
            ))}
          </tbody></table>
        ) : <p className="muted">Nenhuma revisão ainda. Crie a primeira com o protocolo.json exportado da Bancada.</p>}
      </div>
      <NewProject />
    </main>
  );
}

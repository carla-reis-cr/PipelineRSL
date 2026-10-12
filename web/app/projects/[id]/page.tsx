import { notFound } from "next/navigation";
import Link from "next/link";
import { buildStrings } from "@/lib/protocol";
import { SOURCE_LABELS, type Protocol } from "@/lib/types";
import { supabaseServer } from "@/lib/supabase/server";
import { CONNECTORS } from "@/lib/connectors";
import Workbench from "./workbench";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: project } = await sb.from("projects").select("id,title,protocol,updated_at").eq("id", id).single();
  if (!project) notFound();
  const { data: imports } = await sb.from("imports").select("id,source,method,file_name,query,total_reported,record_count,status,error,created_at").eq("project_id", id).order("created_at");
  const protocol = project.protocol as Protocol;
  const strings = buildStrings(protocol);
  const apiSources = (protocol.sources ?? []).map((s) => s.id).filter((s) => CONNECTORS[s]);
  const manualSources = (protocol.sources ?? []).map((s) => s.id).filter((s) => !CONNECTORS[s]);
  return (
    <main>
      <p><Link href="/">← Revisões</Link></p>
      <h1>{project.title || "(sem título)"}</h1>
      <Workbench
        projectId={id}
        apiSources={apiSources.map((s) => ({ id: s, label: SOURCE_LABELS[s as keyof typeof SOURCE_LABELS] ?? s }))}
        manualSources={manualSources.map((s) => ({ id: s, label: SOURCE_LABELS[s as keyof typeof SOURCE_LABELS] ?? s, string: strings.find((x) => x.id === s)?.s ?? "" }))}
        imports={imports ?? []}
      />
    </main>
  );
}

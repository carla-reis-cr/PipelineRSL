import { notFound, redirect } from "next/navigation";
import { CONNECTORS } from "@/lib/connectors";
import { supabaseServer } from "@/lib/supabase/server";
import type { Protocol } from "@/lib/types";
import Workbench from "./workbench";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: project } = await sb.from("projects").select("id,protocol").eq("id", id).single();
  if (!project) notFound();
  const { data: imports } = await sb.from("imports").select("id,source,method,file_name,query,total_reported,record_count,status,error,created_at").eq("project_id", id).order("created_at");
  return (
    <Workbench
      projectId={id}
      me={auth.user.id}
      aiEnabled={!!process.env.ANTHROPIC_API_KEY}
      apiIds={Object.keys(CONNECTORS)}
      protocol={project.protocol as Protocol}
      imports={imports ?? []}
    />
  );
}

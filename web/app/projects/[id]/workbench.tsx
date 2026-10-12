"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { extractPool } from "@/lib/screening";
import type { Protocol } from "@/lib/types";
import AiTab from "./ai-tab";
import ExtractTab from "./extract-tab";
import ImportTab from "./import-tab";
import PrismaTab from "./prisma-tab";
import ProtocolTab from "./protocol-tab";
import ScreenTab from "./screen-tab";
import { BancadaProvider, useB, type ImportRow } from "./store";

const TABS = ["protocolo", "importar", "ta", "ft", "ex", "prisma", "ia"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { protocolo: "Protocolo", importar: "Busca e importação", ta: "Triagem título/resumo", ft: "Elegibilidade", ex: "Extração", prisma: "Fluxograma PRISMA", ia: "Uso de IA" };
const fmtN = (n: number) => n.toLocaleString("pt-BR");

export default function Workbench(props: { projectId: string; me: string; aiEnabled: boolean; apiIds: string[]; protocol: Protocol; imports: ImportRow[] }) {
  return (
    <BancadaProvider projectId={props.projectId} me={props.me} aiEnabled={props.aiEnabled} initialProtocol={props.protocol} initialImports={props.imports}>
      <Shell apiIds={props.apiIds} />
    </BancadaProvider>
  );
}

function Shell({ apiIds }: { apiIds: string[] }) {
  const { projectId, protocol, save, loading, F, S, votes, ex, me, myRole, canWrite, team, refresh } = useB();
  const [tab, setTab] = useState<Tab>("protocolo");
  const storeKey = "bancada-view:" + projectId;
  useEffect(() => {
    try { const v = localStorage.getItem(storeKey) as Tab | null; if (v && TABS.includes(v)) setTab(v); } catch { /* sem armazenamento local */ }
  }, [storeKey]);
  const show = (t: Tab) => { setTab(t); try { localStorage.setItem(storeKey, t); } catch { /* idem */ } };

  const badges = useMemo(() => {
    const pending = (stage: "ta" | "ft") => {
      const pool = stage === "ta" ? F.screen : S.ftPool, st = stage === "ta" ? S.ta : S.ft;
      const pend = pool.filter((r) => (myRole ? !votes[stage][me]?.[r.key] : st[r.key].s === "pend")).length;
      const conf = pool.filter((r) => st[r.key].s === "conf").length;
      return { text: conf ? `${fmtN(pend)} · ${conf} conflito${conf > 1 ? "s" : ""}` : fmtN(pend), warn: conf > 0 };
    };
    const pool = extractPool(S);
    return {
      importar: { text: fmtN(F.recs.length), warn: false }, ta: pending("ta"), ft: pending("ft"),
      ex: { text: pool.length ? `${fmtN(pool.filter((r) => ex[r.key]?.done).length)}/${fmtN(pool.length)}` : "0", warn: false },
    } as Partial<Record<Tab, { text: string; warn: boolean }>>;
  }, [F, S, votes, ex, me, myRole]);

  return (
    <div className="wrap">
      <header className="top">
        <div className="id">
          <span className="eyebrow"><Link href="/">← Revisões</Link> · Protocolo · busca · triagem · PRISMA 2020</span>
          <h1>{protocol.title || "Revisão sem título"}</h1>
        </div>
        <div className="status">
          <div className={"save " + save.cls} aria-live="polite"><i /><span>{loading ?? save.txt}</span></div>
          <div className="me">
            {team.length === 0 ? "" : myRole ? <>Você é <b>{myRole === "r1" ? "Revisor 1" : "Revisor 2"}</b></> : canWrite ? "Você ainda não é revisor nesta revisão" : "Acesso somente leitura"}
            {" "}<button className="link" onClick={() => refresh()} title="Buscar decisões novas de outros membros da equipe">Atualizar</button>
          </div>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t, i) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => show(t)}>
            <span className="n">{String(i + 1).padStart(2, "0")}</span>{TAB_LABEL[t]}
            {badges[t] && <span className={"badge" + (badges[t]!.warn ? " warn" : "")}>{badges[t]!.text}</span>}
          </button>
        ))}
      </nav>

      {tab === "protocolo" && <ProtocolTab />}
      {tab === "importar" && <ImportTab apiIds={apiIds} />}
      {tab === "ta" && <ScreenTab key="ta" stage="ta" />}
      {tab === "ft" && <ScreenTab key="ft" stage="ft" />}
      {tab === "ex" && <ExtractTab />}
      {tab === "prisma" && <PrismaTab />}
      {tab === "ia" && <AiTab />}

      <p className="foot">Segue o PRISMA 2020 (Page et al., 2021) e o PRISMA-P. As decisões de outros membros da equipe aparecem ao abrir a página ou ao clicar em Atualizar.</p>
    </div>
  );
}

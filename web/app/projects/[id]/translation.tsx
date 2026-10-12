"use client";
import { useEffect, useState } from "react";

/**
 * Tradução do título e do resumo para português com o tradutor embutido do
 * navegador (Translator API, Chrome 138+). Roda na máquina de quem lê: não usa
 * chave nem servidor, e a tradução não é gravada no banco. O original continua
 * na tela; a tradução é só apoio à leitura.
 */
interface BrowserTranslator { translate(text: string): Promise<string> }
interface TranslatorFactory {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create(o: { sourceLanguage: string; targetLanguage: string; monitor?: (m: EventTarget) => void }): Promise<BrowserTranslator>;
}
const factory = (): TranslatorFactory | undefined => (globalThis as { Translator?: TranslatorFactory }).Translator;

const AUTO_KEY = "bancada-traduzir-sempre";
const cache = new Map<string, { title: string; abstract: string }>(); // por registro, enquanto a página estiver aberta
let translator: Promise<BrowserTranslator> | null = null;

function getTranslator(onProgress: (pct: number) => void): Promise<BrowserTranslator> {
  const T = factory();
  if (!T) return Promise.reject(new Error("sem suporte"));
  translator ??= T.create({
    sourceLanguage: "en", targetLanguage: "pt",
    monitor: (m) => m.addEventListener("downloadprogress", (e) => onProgress(Math.round(((e as ProgressEvent).loaded ?? 0) * 100))),
  }).catch((e) => { translator = null; throw e; });
  return translator;
}

export default function Translation({ id, title, abstract }: { id: string; title: string; abstract?: string }) {
  const [supported, setSupported] = useState(true);
  const [auto, setAuto] = useState(false);
  const [state, setState] = useState<{ busy?: string; err?: string; done?: { title: string; abstract: string } }>({ done: cache.get(id) });

  async function run() {
    setState({ busy: "Traduzindo…" });
    try {
      const t = await getTranslator((pct) => setState({ busy: `Baixando o modelo de tradução… ${pct}%` }));
      setState({ busy: "Traduzindo…" });
      const done = { title: await t.translate(title), abstract: abstract ? await t.translate(abstract) : "" };
      cache.set(id, done);
      setState({ done });
    } catch {
      setState({ err: "Não foi possível traduzir neste navegador. Se for o primeiro uso, clique de novo para baixar o modelo de tradução." });
    }
  }

  useEffect(() => {
    setSupported(!!factory());
    let on = false;
    try { on = localStorage.getItem(AUTO_KEY) === "1"; } catch { /* sem armazenamento local */ }
    setAuto(on);
    // com o modelo já baixado traduz sozinho; o primeiro uso precisa de um clique, que autoriza o download
    if (on && !cache.has(id)) factory()?.availability({ sourceLanguage: "en", targetLanguage: "pt" }).then((a) => { if (a === "available") run(); }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleAuto(v: boolean) {
    setAuto(v);
    try { localStorage.setItem(AUTO_KEY, v ? "1" : "0"); } catch { /* idem */ }
    if (v && !state.done && !state.busy) run();
  }

  if (!supported) return <p className="note">Tradução para português: disponível no Chrome 138 ou mais novo, no computador (usa o tradutor embutido do navegador).</p>;
  return (
    <div className="tr">
      <div className="row">
        {!state.done && <button className="btn ghost small" disabled={!!state.busy} onClick={run}>Traduzir para português</button>}
        <label className="check"><input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} /><span>Traduzir sempre</span></label>
        <span className="note" role="status">{state.busy ?? state.err ?? ""}</span>
      </div>
      {state.done && (
        <div className="tr-out" lang="pt-BR">
          <span className="eyebrow">Tradução automática (navegador) · o original acima é a referência</span>
          <p className="tr-t">{state.done.title}</p>
          {state.done.abstract && <p className="ab">{state.done.abstract}</p>}
        </div>
      )}
    </div>
  );
}

/** PDF do protocolo: converte o modelo do documento (o mesmo do Word) em definição do pdfmake. */
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { DocNode, ListItem, Run } from "./protocol-doc";

/** O Roboto do PDF não tem setas, marcas de seleção e alguns símbolos: troca por equivalentes que ele tem. */
const SUBST: [RegExp, string][] = [
  [/↔|⇔/g, "<->"], [/→|➔|➜|⟶/g, "->"], [/←|⟵/g, "<-"], [/⇒/g, "=>"], [/⇐/g, "<="], [/↑/g, "^"], [/↓/g, "v"],
  [/✓|✔|☑/g, "[x]"], [/✗|✘|☐|□/g, "[ ]"], [/★|☆/g, "*"], [/▪|◦|‣/g, "•"],
  [/∧/g, "AND"], [/∨/g, "OR"], [/⊂/g, "contido em"], [/∈/g, "em"],
  [/[\u200B-\u200D\uFE0E\uFE0F]/g, ""], [/\p{Extended_Pictographic}/gu, ""],
];
export const pdfText = (t: string) => SUBST.reduce((a, [re, to]) => a.replace(re, to), String(t ?? ""));

const runs = (rs: Run[]) => rs.map((r) => ({ text: pdfText(r.text), bold: r.b, italics: r.i }));

function listOf(items: ListItem[]): Content[] {
  return items.map((it) => (it.children?.length
    ? { stack: [{ text: runs(it.runs) }, { ul: listOf(it.children), margin: [0, 2, 0, 0] }] }
    : { text: runs(it.runs) }));
}

export function pdfDefinition(M: DocNode[], title: string): TDocumentDefinitions {
  const body: Content[] = [];
  for (const n of M) {
    if (n.t === "title") body.push({ text: pdfText(n.text), style: "title" });
    else if (n.t === "h") body.push({ text: pdfText(n.text), style: "h" });
    else if (n.t === "h2") body.push({ text: pdfText(n.text), style: "h2" });
    else if (n.t === "p") body.push({ text: runs(n.runs), alignment: "justify", margin: [0, 0, 0, 6] });
    else if (n.t === "small") body.push({ text: pdfText(n.text), italics: true, fontSize: 9, color: "#555555", margin: [0, 0, 0, 8] });
    else if (n.t === "meta") body.push({ text: pdfText(n.text), italics: true, fontSize: 9, color: "#777777", margin: [0, 20, 0, 0] });
    else if (n.t === "code") body.push({ text: pdfText(n.text), fontSize: 8.5, background: "#F2F2F2", preserveLeadingSpaces: true, margin: [0, 0, 0, 4] });
    else if (n.t === "ul") body.push({ ul: listOf(n.items), margin: [0, 0, 0, 6] });
    else if (n.t === "ol") body.push({ ol: listOf(n.items), margin: [0, 0, 0, 6] });
    else if (n.t === "table") {
      const cols = n.widths.length;
      body.push({
        table: {
          headerRows: 1,
          widths: n.widths.map((w) => w + "%"),
          body: [
            n.head.map((h) => ({ text: pdfText(h), bold: true })),
            ...n.rows.map((r) => r.map((cell) => ({ stack: cell.map((pp) => ({ text: runs(pp), margin: [0, 0, 0, 2] as [number, number, number, number] })) }))),
          ],
        },
        // sem as linhas das bordas esquerda e direita; linha do topo mais grossa
        layout: {
          hLineWidth: (i: number) => (i === 0 ? 2 : 0.5),
          vLineWidth: (i: number) => (i === 0 || i === cols ? 0 : 0.5),
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
          paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 5, paddingRight: () => 5,
        },
        margin: [0, 2, 0, 10],
      });
    }
  }
  return {
    info: { title: pdfText(title), creator: "Pipeline RSL" },
    pageSize: "A4",
    pageMargins: [72, 72, 72, 72],
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.25 },
    styles: {
      title: { fontSize: 13, bold: true, margin: [0, 0, 0, 14] },
      h: { fontSize: 11, bold: true, margin: [0, 14, 0, 6] },
      h2: { fontSize: 11, bold: true, margin: [0, 8, 0, 5] },
    },
    footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: "center", fontSize: 8.5, color: "#777777", margin: [0, 24, 0, 0] }),
    content: body,
  };
}

/** Gera o PDF e devolve o arquivo (pdfmake e as fontes só são baixados quando alguém pede o PDF). */
export async function buildPdfBlob(M: DocNode[], title: string): Promise<Blob> {
  const [{ default: pdfMake }, fonts] = await Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]);
  const vfs = (fonts as { default?: unknown }).default ?? fonts;
  (pdfMake as unknown as { vfs: unknown }).vfs = vfs;
  const doc = pdfMake.createPdf(pdfDefinition(M, title)) as unknown as { getBlob(cb: (b: Blob) => void): void }; // pdfmake 0.2 usa callback
  return new Promise((resolve) => doc.getBlob(resolve));
}

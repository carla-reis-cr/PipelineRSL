import { ieee } from "./ieee";
import { scopus } from "./scopus";
import type { Connector } from "./types";

/** Bases com busca por API. As demais entram por arquivo exportado (lib/parsers). */
export const CONNECTORS: Record<string, Connector> = {
  [scopus.id]: scopus,
  [ieee.id]: ieee,
};

export * from "./types";

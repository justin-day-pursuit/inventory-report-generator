/**
 * ============================================================================
 * AI CURATED REPORT (lib/ai-report.ts)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Asks Google Gemini to write a plain-English weekly inventory status report
 * for FreshRoute's operations manager — the kind Alicia (Inventory Coordinator)
 * would hand over after reviewing stock, shelf life, and reorders.
 *
 * It combines:
 *   1) RAW spreadsheet facts (row counts, brands, storage mix from the CSV)
 *   2) TRANSFORMED batch facts (status totals, urgent lines from generateStockReport)
 *
 * The model returns structured JSON (headline, narrative, classifications,
 * outliers, chart bars, recommendations). The API route merges that with the
 * deterministic totals/table so the page still works if wording varies.
 *
 * HOW TO MAINTAIN:
 * - Company voice / role instructions live in FRESHROUTE_CONTEXT below —
 *   edit those paragraphs if the business story changes.
 * - Chart labels and severity words are validated after the model responds;
 *   safe defaults kick in when a field is missing.
 * - Keep payloads compact (summaries + top urgent batches). Do not send the
 *   entire 4,000-line CSV — that wastes free-tier quota and slows the page.
 * - Only server code should call generateAiCuratedReport (it holds the API key).
 * ============================================================================
 */

import "server-only";

import { Type, type Schema } from "@google/genai";
import { createGeminiClient, sanitizeGeminiError } from "./gemini";
import type { StockLine, StockReport } from "./inventory";
import type { CsvTable } from "./csv";

/* -------------------------------------------------------------------------- */
/* Company story — edit this when FreshRoute's context changes                */
/* -------------------------------------------------------------------------- */

const FRESHROUTE_CONTEXT = `
You are writing a weekly inventory status report for FreshRoute, a dairy
distribution company in the Midwest. FreshRoute sources milk, yogurt, cheese,
butter, cream, and other dairy from local farms and ships to grocery stores,
restaurants, and food service accounts (~80 active products across brands).

Alicia is the Inventory Coordinator. She monitors on-hand quantities vs minimum
thresholds, watches expiration / shelf life to limit waste, flags sold-out /
understocked / overstocked / expiring batches, coordinates supplier reorders,
and prepares this report for the operations manager.

When inventory is mismanaged: stockouts, waste from sitting product, or customers
receiving expired goods — all expensive. Write for a busy manager: clear,
actionable, no jargon, no filler.
`.trim();

/* -------------------------------------------------------------------------- */
/* Public types returned to the API / UI                                      */
/* -------------------------------------------------------------------------- */

export type AiSeverity = "critical" | "high" | "medium" | "low" | "ok";

export type AiClassification = {
  label: string;
  count: number;
  meaning: string;
  severity: AiSeverity;
};

export type AiOutlier = {
  name: string;
  location: string;
  why: string;
  action: string;
  severity: AiSeverity;
};

export type AiChartBar = {
  label: string;
  value: number;
};

export type AiRecommendation = {
  priority: number;
  title: string;
  detail: string;
};

/**
 * Structured narrative Gemini returns for the curated report panel.
 * Chart numbers should match the deterministic totals when possible so the
 * bars stay honest even if the wording is creative.
 */
export type AiCuratedNarrative = {
  headline: string;
  weekNarrative: string;
  executiveSummary: string;
  classifications: AiClassification[];
  outliers: AiOutlier[];
  chartData: {
    stockStatus: AiChartBar[];
    expirationStatus: AiChartBar[];
    actionMix: AiChartBar[];
  };
  recommendations: AiRecommendation[];
  supplierNotes: string[];
};

export type AiReportResult = {
  narrative: AiCuratedNarrative;
  model: string;
  /** Account label from GEMINI_API_USERNAME (never the key). */
  accountLabel: string | null;
};

/* -------------------------------------------------------------------------- */
/* Compact payloads — raw CSV summary + transformed batch digest              */
/* -------------------------------------------------------------------------- */

type RawDataDigest = {
  sourceFile: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  brandCounts: { brand: string; rows: number }[];
  productCounts: { product: string; rows: number }[];
  storageCounts: { storage: string; rows: number }[];
  salesChannelCounts: { channel: string; rows: number }[];
  locationCounts: { location: string; rows: number }[];
};

type TransformedDigest = {
  referenceDate: string;
  summary: string;
  recommendations: string[];
  totals: StockReport["totals"];
  urgentBatches: {
    name: string;
    location: string;
    salesChannel: string;
    storageCondition: string;
    quantity: number;
    minimumStockThreshold: number;
    reorderQuantity: number;
    expirationDate: string;
    expirationStatus: string;
    stockStatus: string;
    daysUntilExpiration: number;
  }[];
};

/** Caps how many urgent batch rows we send to the model (free-tier friendly). */
const URGENT_BATCH_LIMIT = 40;

/** Caps how many group labels we include in raw digests. */
const GROUP_LIMIT = 12;

/**
 * Summarises the RAW CSV (before batch roll-up) so the model sees volume and mix
 * without receiving thousands of full rows.
 */
export function buildRawDataDigest(
  table: CsvTable,
  sourceFile = "data/inventory/inventory.csv"
): RawDataDigest {
  const brandCounts = countColumn(table, "Brand");
  const productCounts = countColumn(table, "Product Name");
  const storageCounts = countColumn(table, "Storage Condition");
  const salesChannelCounts = countColumn(table, "Sales Channel");
  const locationCounts = countColumn(table, "Location");

  return {
    sourceFile,
    rowCount: table.rows.length,
    columnCount: table.header.length,
    columns: table.header.slice(0, 30),
    brandCounts: topCounts(brandCounts, GROUP_LIMIT).map(([brand, rows]) => ({
      brand,
      rows,
    })),
    productCounts: topCounts(productCounts, GROUP_LIMIT).map(
      ([product, rows]) => ({ product, rows })
    ),
    storageCounts: topCounts(storageCounts, GROUP_LIMIT).map(
      ([storage, rows]) => ({ storage, rows })
    ),
    salesChannelCounts: topCounts(salesChannelCounts, GROUP_LIMIT).map(
      ([channel, rows]) => ({ channel, rows })
    ),
    locationCounts: topCounts(locationCounts, GROUP_LIMIT).map(
      ([location, rows]) => ({ location, rows })
    ),
  };
}

/**
 * Summarises the TRANSFORMED batch report (status math already applied).
 * Urgent lines are sorted worst-first by generateStockReport.
 */
export function buildTransformedDigest(report: StockReport): TransformedDigest {
  const urgent = report.lines
    .filter((line) => line.needsAction)
    .slice(0, URGENT_BATCH_LIMIT)
    .map((line) => slimLine(line));

  // If nothing needs action, still send a small healthy sample so the model
  // can say the week was calm with evidence.
  const sample =
    urgent.length > 0
      ? urgent
      : report.lines.slice(0, 15).map((line) => slimLine(line));

  return {
    referenceDate: report.referenceDate,
    summary: report.summary,
    recommendations: report.recommendations,
    totals: report.totals,
    urgentBatches: sample,
  };
}

function slimLine(line: StockLine) {
  return {
    name: line.name,
    location: line.location,
    salesChannel: line.salesChannel,
    storageCondition: line.storageCondition,
    quantity: round1(line.quantity),
    minimumStockThreshold: round1(line.minimumStockThreshold),
    reorderQuantity: round1(line.reorderQuantity),
    expirationDate: line.expirationDate,
    expirationStatus: line.expirationStatus,
    stockStatus: line.stockStatus,
    daysUntilExpiration: line.daysUntilExpiration,
  };
}

function countColumn(table: CsvTable, column: string): Map<string, number> {
  const counts = new Map<string, number>();
  const idx = table.header.indexOf(column);
  if (idx < 0) return counts;
  for (const row of table.rows) {
    const key = (row[column] ?? "").trim() || "(blank)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function topCounts(map: Map<string, number>, limit: number): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/* -------------------------------------------------------------------------- */
/* Gemini JSON schema — keeps the UI shape stable                             */
/* -------------------------------------------------------------------------- */

const chartBarSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    label: { type: Type.STRING },
    value: { type: Type.NUMBER },
  },
  required: ["label", "value"],
};

const aiReportSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    headline: {
      type: Type.STRING,
      description: "One short title for the week, under 12 words.",
    },
    weekNarrative: {
      type: Type.STRING,
      description:
        "2-4 sentences: how the day/week went for FreshRoute inventory overall.",
    },
    executiveSummary: {
      type: Type.STRING,
      description: "One dense paragraph a manager can skim in 20 seconds.",
    },
    classifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          count: { type: Type.NUMBER },
          meaning: { type: Type.STRING },
          severity: {
            type: Type.STRING,
            enum: ["critical", "high", "medium", "low", "ok"],
          },
        },
        required: ["label", "count", "meaning", "severity"],
      },
    },
    outliers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          location: { type: Type.STRING },
          why: { type: Type.STRING },
          action: { type: Type.STRING },
          severity: {
            type: Type.STRING,
            enum: ["critical", "high", "medium", "low", "ok"],
          },
        },
        required: ["name", "location", "why", "action", "severity"],
      },
    },
    chartData: {
      type: Type.OBJECT,
      properties: {
        stockStatus: { type: Type.ARRAY, items: chartBarSchema },
        expirationStatus: { type: Type.ARRAY, items: chartBarSchema },
        actionMix: { type: Type.ARRAY, items: chartBarSchema },
      },
      required: ["stockStatus", "expirationStatus", "actionMix"],
    },
    recommendations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          priority: { type: Type.NUMBER },
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
        },
        required: ["priority", "title", "detail"],
      },
    },
    supplierNotes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "headline",
    "weekNarrative",
    "executiveSummary",
    "classifications",
    "outliers",
    "chartData",
    "recommendations",
    "supplierNotes",
  ],
};

/* -------------------------------------------------------------------------- */
/* Prompt + call                                                              */
/* -------------------------------------------------------------------------- */

function buildPrompt(
  raw: RawDataDigest,
  transformed: TransformedDigest
): string {
  return `
${FRESHROUTE_CONTEXT}

TASK:
Using BOTH the raw spreadsheet digest and the transformed batch digest below,
write a curated inventory status report for the operations manager.

REQUIREMENTS:
- Ground every number in the provided digests. Do not invent batch counts.
- Prefer the TRANSFORMED totals for status counts (sold out, understocked,
  overstocked, expiring soon, expired, needs action, healthy).
- Use RAW digests for mix context (brands, products, storage, channels, locations).
- Call out outliers that most need Alicia's attention today (expired, sold out,
  deepest understock, soonest expirations). Cap outliers at 8.
- Classifications should help a manager scan risk buckets (include counts).
- chartData.stockStatus should cover: Sold out, Understocked, Healthy, Overstocked
  with values from transformed.totals.
- chartData.expirationStatus should cover: Expired, Expiring soon, OK
  (OK ≈ itemCount − expired − expiringSoon).
- chartData.actionMix should cover: Need action, Healthy / watch
  (Need action = needsActionCount; Healthy / watch = the rest).
- recommendations: 3–6 concrete next steps, priority 1 = most urgent.
- supplierNotes: short bullets Alicia can use when calling farms/suppliers.
- Tone: calm, specific, Midwest dairy operations — not hype.

RAW SPREADSHEET DIGEST (JSON):
${JSON.stringify(raw)}

TRANSFORMED BATCH DIGEST (JSON):
${JSON.stringify(transformed)}
`.trim();
}

/**
 * Fallback narrative built only from deterministic totals when Gemini is
 * unavailable — keeps the page useful during key/setup problems in tests.
 */
export function buildFallbackNarrative(report: StockReport): AiCuratedNarrative {
  const t = report.totals;
  const okExpiration = Math.max(
    0,
    t.itemCount - t.expiredCount - t.expiringSoonCount
  );
  const watch = Math.max(0, t.itemCount - t.needsActionCount);

  return {
    headline: "FreshRoute inventory status (rules-based draft)",
    weekNarrative: report.summary,
    executiveSummary: report.summary,
    classifications: [
      {
        label: "Need action",
        count: t.needsActionCount,
        meaning: "Expired, expiring soon, sold out, or understocked batches.",
        severity: t.needsActionCount > 0 ? "high" : "ok",
      },
      {
        label: "Expired",
        count: t.expiredCount,
        meaning: "Past the status-clock date — remove or markdown.",
        severity: t.expiredCount > 0 ? "critical" : "ok",
      },
      {
        label: "Expiring soon",
        count: t.expiringSoonCount,
        meaning: "Within the two-week window — push sales or rotate.",
        severity: t.expiringSoonCount > 0 ? "high" : "ok",
      },
      {
        label: "Sold out",
        count: t.outOfStockCount,
        meaning: "Zero quantity on hand.",
        severity: t.outOfStockCount > 0 ? "critical" : "ok",
      },
      {
        label: "Understocked",
        count: t.understockedCount,
        meaning: "At or below the minimum stock threshold.",
        severity: t.understockedCount > 0 ? "high" : "ok",
      },
      {
        label: "Overstocked",
        count: t.overstockedCount,
        meaning: "Well above reorder planning levels — watch for waste.",
        severity: t.overstockedCount > 0 ? "medium" : "ok",
      },
    ],
    outliers: report.lines
      .filter((l) => l.needsAction)
      .slice(0, 8)
      .map((l) => ({
        name: l.name,
        location: l.location,
        why: `${l.expirationStatus.replaceAll("_", " ")}; ${l.stockStatus.replaceAll("_", " ")}; qty ${round1(l.quantity)}`,
        action:
          l.expirationStatus === "expired"
            ? "Remove or markdown before any further shipments."
            : l.stockStatus === "out_of_stock" || l.stockStatus === "understocked"
              ? `Reorder about ${round1(l.reorderQuantity)} units from suppliers.`
              : "Prioritise sales push / rotation this week.",
        severity:
          l.expirationStatus === "expired" || l.stockStatus === "out_of_stock"
            ? ("critical" as const)
            : ("high" as const),
      })),
    chartData: {
      stockStatus: [
        { label: "Sold out", value: t.outOfStockCount },
        { label: "Understocked", value: t.understockedCount },
        { label: "Healthy", value: t.healthyCount },
        { label: "Overstocked", value: t.overstockedCount },
      ],
      expirationStatus: [
        { label: "Expired", value: t.expiredCount },
        { label: "Expiring soon", value: t.expiringSoonCount },
        { label: "OK", value: okExpiration },
      ],
      actionMix: [
        { label: "Need action", value: t.needsActionCount },
        { label: "Healthy / watch", value: watch },
      ],
    },
    recommendations: report.recommendations.map((detail, index) => ({
      priority: index + 1,
      title: detail.slice(0, 48) + (detail.length > 48 ? "…" : ""),
      detail,
    })),
    supplierNotes: [
      "Confirm farm delivery slots for any understocked refrigerated SKUs.",
      "Ask suppliers to hold or delay POs on clearly overstocked items.",
    ],
  };
}

/**
 * Calls Gemini with raw + transformed digests and returns a validated narrative.
 * On model/parse failure, throws a sanitized Error (no API key in the message).
 */
export async function generateAiCuratedReport(
  table: CsvTable,
  report: StockReport
): Promise<AiReportResult> {
  const { ai, env } = createGeminiClient();
  const raw = buildRawDataDigest(table);
  const transformed = buildTransformedDigest(report);
  const prompt = buildPrompt(raw, transformed);

  try {
    const response = await ai.models.generateContent({
      model: env.model,
      contents: prompt,
      config: {
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: aiReportSchema,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("Gemini returned an empty report.");
    }

    const parsed = JSON.parse(text) as unknown;
    const narrative = normalizeNarrative(parsed, report);

    return {
      narrative,
      model: env.model,
      accountLabel: env.username || null,
    };
  } catch (error) {
    throw new Error(sanitizeGeminiError(error, env.apiKey));
  }
}

/* -------------------------------------------------------------------------- */
/* Soft validation — keep the UI from crashing on odd model output            */
/* -------------------------------------------------------------------------- */

function normalizeNarrative(
  raw: unknown,
  report: StockReport
): AiCuratedNarrative {
  const fallback = buildFallbackNarrative(report);
  if (!raw || typeof raw !== "object") return fallback;

  const obj = raw as Record<string, unknown>;

  return {
    headline: asString(obj.headline, fallback.headline),
    weekNarrative: asString(obj.weekNarrative, fallback.weekNarrative),
    executiveSummary: asString(obj.executiveSummary, fallback.executiveSummary),
    classifications: asClassificationList(obj.classifications, fallback.classifications),
    outliers: asOutlierList(obj.outliers, fallback.outliers),
    chartData: {
      stockStatus: asBars(
        (obj.chartData as Record<string, unknown> | undefined)?.stockStatus,
        fallback.chartData.stockStatus
      ),
      expirationStatus: asBars(
        (obj.chartData as Record<string, unknown> | undefined)?.expirationStatus,
        fallback.chartData.expirationStatus
      ),
      actionMix: asBars(
        (obj.chartData as Record<string, unknown> | undefined)?.actionMix,
        fallback.chartData.actionMix
      ),
    },
    recommendations: asRecommendations(obj.recommendations, fallback.recommendations),
    supplierNotes: asStringList(obj.supplierNotes, fallback.supplierNotes),
  };
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asSeverity(value: unknown): AiSeverity {
  const allowed: AiSeverity[] = ["critical", "high", "medium", "low", "ok"];
  return allowed.includes(value as AiSeverity) ? (value as AiSeverity) : "medium";
}

function asBars(value: unknown, fallback: AiChartBar[]): AiChartBar[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label : "";
      const num = Number(row.value);
      if (!label || !Number.isFinite(num)) return null;
      return { label, value: Math.max(0, Math.round(num)) };
    })
    .filter((x): x is AiChartBar => x !== null);
}

function asClassificationList(
  value: unknown,
  fallback: AiClassification[]
): AiClassification[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label : "";
      const meaning = typeof row.meaning === "string" ? row.meaning : "";
      const count = Number(row.count);
      if (!label || !Number.isFinite(count)) return null;
      return {
        label,
        count: Math.max(0, Math.round(count)),
        meaning: meaning || "See inventory list for details.",
        severity: asSeverity(row.severity),
      };
    })
    .filter((x): x is AiClassification => x !== null);
}

function asOutlierList(value: unknown, fallback: AiOutlier[]): AiOutlier[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name : "";
      const location = typeof row.location === "string" ? row.location : "";
      const why = typeof row.why === "string" ? row.why : "";
      const action = typeof row.action === "string" ? row.action : "";
      if (!name || !why) return null;
      return {
        name,
        location: location || "—",
        why,
        action: action || "Review in the inventory list.",
        severity: asSeverity(row.severity),
      };
    })
    .filter((x): x is AiOutlier => x !== null)
    .slice(0, 8);
}

function asRecommendations(
  value: unknown,
  fallback: AiRecommendation[]
): AiRecommendation[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title : "";
      const detail = typeof row.detail === "string" ? row.detail : "";
      const priority = Number(row.priority);
      if (!title && !detail) return null;
      return {
        priority: Number.isFinite(priority) ? priority : index + 1,
        title: title || `Action ${index + 1}`,
        detail: detail || title,
      };
    })
    .filter((x): x is AiRecommendation => x !== null)
    .sort((a, b) => a.priority - b.priority);
}

function asStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const list = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return list.length > 0 ? list : fallback;
}

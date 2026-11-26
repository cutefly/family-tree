"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as f3 from "family-chart";
import "family-chart/styles/family-chart.css";
import type { ChildOrderMode, FamilyTree, Marriage, Person } from "@prisma/client";
import {
  formatPersonDisplayName,
  toFamilyChartData,
  type FamilyChartDatum,
} from "@/lib/family-graph";

export interface FamilyTreeCanvasProps {
  persons: Person[];
  marriages: Marriage[];
  tree: Pick<
    FamilyTree,
    "bonKo" | "bonHanja" | "surnameKo" | "surnameHanja" | "childOrderMode" | "rootPersonId"
  >;
  mode: "view" | "edit";
  onGraphChange?: (nodes: FamilyChartDatum[]) => Promise<void>;
}

const EDIT_FIELDS = [
  { type: "text", label: "한글 이름", id: "nameKo" },
  { type: "text", label: "한자 이름", id: "nameHanja" },
  { type: "text", label: "성씨 (한글)", id: "surnameKo" },
  { type: "text", label: "성씨 (한자)", id: "surnameHanja" },
  { type: "text", label: "본관 (한글)", id: "bonKo" },
  { type: "text", label: "본관 (한자)", id: "bonHanja" },
  { type: "text", label: "생년월일", id: "birthDate" },
  { type: "text", label: "사망일", id: "deathDate" },
  { type: "text", label: "자녀 순번", id: "birthOrder" },
  { type: "textarea", label: "메모", id: "memo" },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function FamilyTreeCanvas({
  persons,
  marriages,
  tree,
  mode,
  onGraphChange,
}: FamilyTreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof f3.createChart> | null>(null);
  const onGraphChangeRef = useRef(onGraphChange);
  const skipNextReinitRef = useRef(false);

  onGraphChangeRef.current = onGraphChange;

  const [childOrderMode, setChildOrderMode] = useState<ChildOrderMode>(
    tree.childOrderMode
  );
  const [ancestryDepth, setAncestryDepth] = useState<number | null>(null);
  const [progenyDepth, setProgenyDepth] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const chartData = useMemo(
    () => toFamilyChartData(persons, marriages, childOrderMode),
    [persons, marriages, childOrderMode]
  );

  useEffect(() => {
    setChildOrderMode(tree.childOrderMode);
  }, [tree.childOrderMode]);

  useEffect(() => {
    if (skipNextReinitRef.current) {
      skipNextReinitRef.current = false;
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    if (mode === "view" && chartData.length === 0) {
      container.innerHTML = "";
      chartRef.current = null;
      return;
    }

    container.innerHTML = "";

    const initialData =
      chartData.length > 0
        ? chartData
        : [
            {
              id: crypto.randomUUID(),
              data: {
                displayName: "시조",
                hanjaName: "",
                nameKo: "시조",
                nameHanja: "",
                surnameKo: tree.surnameKo ?? "",
                surnameHanja: tree.surnameHanja ?? "",
                bonKo: tree.bonKo ?? "",
                bonHanja: tree.bonHanja ?? "",
                gender: "M" as const,
                actualGender: "MALE" as const,
                birthDate: "",
                deathDate: "",
                birthOrder: "1",
                memo: "",
              },
              rels: { parents: [], children: [], spouses: [] },
            },
          ];

    const f3Chart = f3.createChart(container, initialData as unknown as f3.Data);
    chartRef.current = f3Chart;

    f3Chart.setTransitionTime(400).setCardXSpacing(240).setCardYSpacing(150);

    if (ancestryDepth !== null) {
      f3Chart.setAncestryDepth(ancestryDepth);
    }
    if (progenyDepth !== null) {
      f3Chart.setProgenyDepth(progenyDepth);
    }

    const f3Card = f3Chart.setCardHtml();
    f3Card.setCardDisplay([
      (d: { data: Record<string, string> }) => {
        const { primary, secondary } = formatPersonDisplayName({
          nameKo: d.data.nameKo ?? null,
          nameHanja: d.data.nameHanja ?? null,
          surnameKo: d.data.surnameKo ?? null,
          bonKo: d.data.bonKo ?? null,
        });
        const text = secondary ? `${primary} (${secondary})` : primary;
        return escapeHtml(text);
      },
      (d: { data: Record<string, string> }) => {
        const parts = [d.data.birthDate, d.data.deathDate].filter(Boolean);
        return escapeHtml(parts.join(" ~ "));
      },
    ]);

    if (mode === "edit") {
      const f3EditTree = f3Chart
        .editTree()
        .setFields(EDIT_FIELDS)
        .setEditFirst(true)
        .setCardClickOpen(f3Card)
        .setOnChange(async () => {
          const handler = onGraphChangeRef.current;
          if (!handler) return;
          try {
            setSaving(true);
            setErrorMsg(null);
            const exported = f3EditTree.exportData() as unknown as FamilyChartDatum[];
            skipNextReinitRef.current = true;
            await handler(exported);
          } catch (err) {
            skipNextReinitRef.current = false;
            setErrorMsg(
              err instanceof Error ? err.message : "저장 중 오류가 발생했습니다."
            );
          } finally {
            setSaving(false);
          }
        });
    }

    if (tree.rootPersonId) {
      const hasRoot = initialData.some((n) => n.id === tree.rootPersonId);
      if (hasRoot) {
        f3Chart.updateMainId(tree.rootPersonId);
      }
    }

    f3Chart.updateTree({ initial: true });

    return () => {
      container.innerHTML = "";
      chartRef.current = null;
    };
  }, [
    chartData,
    mode,
    ancestryDepth,
    progenyDepth,
    tree.rootPersonId,
    tree.bonKo,
    tree.bonHanja,
    tree.surnameKo,
    tree.surnameHanja,
  ]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span>상위 세대</span>
            <select
              value={ancestryDepth === null ? "all" : String(ancestryDepth)}
              onChange={(e) =>
                setAncestryDepth(
                  e.target.value === "all" ? null : Number(e.target.value)
                )
              }
              className="rounded border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-sm text-[var(--text-primary)]"
            >
              <option value="all">전체</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}대
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span>하위 세대</span>
            <select
              value={progenyDepth === null ? "all" : String(progenyDepth)}
              onChange={(e) =>
                setProgenyDepth(
                  e.target.value === "all" ? null : Number(e.target.value)
                )
              }
              className="rounded border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-sm text-[var(--text-primary)]"
            >
              <option value="all">전체</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}대
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span>자녀 나열</span>
            <select
              value={childOrderMode}
              onChange={(e) =>
                setChildOrderMode(e.target.value as ChildOrderMode)
              }
              className="rounded border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-sm text-[var(--text-primary)]"
            >
              <option value="BY_ORDER">순번순</option>
              <option value="BY_GENDER_THEN_ORDER">성별+순번순</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs font-medium text-blue-500">저장 중...</span>
          )}
          {errorMsg && (
            <span className="text-xs font-medium text-red-500">{errorMsg}</span>
          )}
        </div>
      </div>

      {mode === "view" && chartData.length === 0 ? (
        <div className="flex flex-1 items-center justify-center bg-[var(--bg-page)] text-sm text-[var(--text-secondary)]">
          등록된 인물이 없습니다.
        </div>
      ) : (
        <div
          ref={containerRef}
          id="FamilyChart"
          className="f3 relative flex-1 bg-[var(--bg-page)]"
          style={{ minHeight: "600px" }}
        />
      )}
    </div>
  );
}

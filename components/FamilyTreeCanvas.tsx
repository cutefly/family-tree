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
  const skipNextDataSyncRef = useRef(false);

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
  const latestChartDataRef = useRef(chartData);
  latestChartDataRef.current = chartData;

  useEffect(() => {
    setChildOrderMode(tree.childOrderMode);
  }, [tree.childOrderMode]);

  // Mount/re-mount f3Chart only when mode changes (or view empty state toggles)
  const isEmptyView = mode === "view" && chartData.length === 0;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || isEmptyView) {
      chartRef.current = null;
      return;
    }

    container.innerHTML = "";

    const data = latestChartDataRef.current;
    const initialData =
      data.length > 0
        ? data
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
        .setOnFormCreation(({ cont, form_creator }) => {
          const storeData = f3Chart.store.getData() as unknown as FamilyChartDatum[];
          const current = storeData.find((d) => d.id === form_creator.datum_id) as
            | (FamilyChartDatum & {
                _new_rel_data?: {
                  rel_type: string;
                  rel_id?: string;
                  other_parent_id?: string;
                };
              })
            | undefined;
          if (!current) return;

          const isNewRel = Boolean(current._new_rel_data);
          if (
            isNewRel &&
            current._new_rel_data?.rel_type !== "son" &&
            current._new_rel_data?.rel_type !== "daughter"
          ) {
            return;
          }

          const parentNodes = (current.rels?.parents ?? [])
            .map((pid) => storeData.find((d) => d.id === pid))
            .filter((d): d is FamilyChartDatum => Boolean(d));

          const relParent = current._new_rel_data?.rel_id
            ? storeData.find((d) => d.id === current._new_rel_data?.rel_id)
            : undefined;
          const allParents = [...parentNodes];
          if (relParent && !allParents.some((p) => p.id === relParent.id)) {
            allParents.push(relParent);
          }

          const father =
            allParents.find((p) => p.data.gender !== "F") ?? allParents[0];
          if (!father) return;

          const currentMother = isNewRel
            ? allParents.find(
                (p) =>
                  p.id !== father.id &&
                  (p.id === current._new_rel_data?.other_parent_id ||
                    p.data.gender === "F")
              )
            : allParents.find(
                (p) => p.id !== father.id && p.data.gender === "F"
              );

          const candidateIds = new Set<string>(father.rels?.spouses ?? []);
          if (currentMother) candidateIds.add(currentMother.id);

          const candidates = Array.from(candidateIds)
            .map((id) => storeData.find((d) => d.id === id))
            .filter((d): d is FamilyChartDatum => Boolean(d));

          if (candidates.length < 2 && (candidates.length === 0 || currentMother)) {
            return;
          }

          const existing = cont.querySelector(".f3-mother-select-field");
          if (existing) existing.remove();

          const wrapper = document.createElement("div");
          wrapper.className = "f3-form-field f3-mother-select-field";

          const label = document.createElement("label");
          label.textContent = "어머니 선택";
          wrapper.appendChild(label);

          const select = document.createElement("select");
          const emptyOpt = document.createElement("option");
          emptyOpt.value = "";
          emptyOpt.textContent = "선택 안 함";
          select.appendChild(emptyOpt);

          for (const cand of candidates) {
            const opt = document.createElement("option");
            opt.value = cand.id;
            const { primary, secondary } = formatPersonDisplayName({
              nameKo: cand.data.nameKo || null,
              nameHanja: cand.data.nameHanja || null,
              surnameKo: cand.data.surnameKo || null,
              bonKo: cand.data.bonKo || null,
            });
            opt.textContent = secondary ? `${primary} (${secondary})` : primary;
            if (currentMother?.id === cand.id) {
              opt.selected = true;
            }
            select.appendChild(opt);
          }

          select.addEventListener("change", async () => {
            const nextMotherId = select.value || null;
            const prevMotherId = current.rels.parents.find((pid) => pid !== father.id);
            if (prevMotherId) {
              const prevMother = storeData.find((d) => d.id === prevMotherId);
              if (prevMother) {
                prevMother.rels.children = (prevMother.rels.children ?? []).filter(
                  (cid) => cid !== current.id
                );
              }
            }
            current.rels.parents = (current.rels.parents ?? []).filter(
              (pid) => pid === father.id
            );
            if (nextMotherId) {
              const nextMother = storeData.find((d) => d.id === nextMotherId);
              if (nextMother) {
                current.rels.parents.push(nextMother.id);
                nextMother.rels.children = nextMother.rels.children ?? [];
                if (!nextMother.rels.children.includes(current.id)) {
                  nextMother.rels.children.push(current.id);
                }
              }
            }
            if (isNewRel && current._new_rel_data) {
              current._new_rel_data.other_parent_id = nextMotherId ?? undefined;
              return;
            }

            f3Chart.updateTree({});
            const handler = onGraphChangeRef.current;
            if (!handler) return;
            try {
              setSaving(true);
              setErrorMsg(null);
              const exported = f3EditTree.exportData() as unknown as FamilyChartDatum[];
              skipNextDataSyncRef.current = true;
              await handler(exported);
            } catch (err) {
              skipNextDataSyncRef.current = false;
              setErrorMsg(
                err instanceof Error ? err.message : "저장 중 오류가 발생했습니다."
              );
            } finally {
              setSaving(false);
            }
          });

          const firstFieldEl = cont.querySelector(".f3-form-field");
          const buttonsEl = cont.querySelector(".f3-form-buttons");
          if (firstFieldEl && firstFieldEl.parentNode) {
            firstFieldEl.parentNode.insertBefore(wrapper, firstFieldEl);
          } else if (buttonsEl && buttonsEl.parentNode) {
            buttonsEl.parentNode.insertBefore(wrapper, buttonsEl);
          } else {
            const formEl = cont.querySelector("form");
            formEl?.appendChild(wrapper);
          }
        })
        .setOnChange(async () => {
          const handler = onGraphChangeRef.current;
          if (!handler) return;
          try {
            setSaving(true);
            setErrorMsg(null);
            const exported = f3EditTree.exportData() as unknown as FamilyChartDatum[];
            skipNextDataSyncRef.current = true;
            await handler(exported);
          } catch (err) {
            skipNextDataSyncRef.current = false;
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
  }, [mode, isEmptyView, tree.rootPersonId, tree.bonKo, tree.bonHanja, tree.surnameKo, tree.surnameHanja]);

  // Sync external data changes (e.g. childOrderMode toggle) without tearing down chart
  useEffect(() => {
    const f3Chart = chartRef.current;
    if (!f3Chart) return;
    if (skipNextDataSyncRef.current) {
      skipNextDataSyncRef.current = false;
      return;
    }
    if (chartData.length > 0) {
      f3Chart.updateData(chartData as unknown as f3.Data);
      f3Chart.updateTree({});
    }
  }, [chartData]);

  // Sync ancestry/progeny depth options without tearing down chart
  useEffect(() => {
    const f3Chart = chartRef.current;
    if (!f3Chart) return;
    f3Chart.setAncestryDepth(ancestryDepth ?? 100);
    f3Chart.setProgenyDepth(progenyDepth ?? 100);
    f3Chart.updateTree({});
  }, [ancestryDepth, progenyDepth]);

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

      {isEmptyView ? (
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

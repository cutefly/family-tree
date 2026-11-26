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

const EDIT_FIELDS_BEFORE_MOTHER = [
  { type: "text", label: "한글 이름", id: "nameKo" },
  { type: "text", label: "한자 이름", id: "nameHanja" },
  { type: "text", label: "성씨 (한글)", id: "surnameKo" },
  { type: "text", label: "성씨 (한자)", id: "surnameHanja" },
  { type: "text", label: "본관 (한글)", id: "bonKo" },
  { type: "text", label: "본관 (한자)", id: "bonHanja" },
  { type: "text", label: "생년월일", id: "birthDate" },
  { type: "text", label: "사망일", id: "deathDate" },
  { type: "text", label: "자녀 순번", id: "birthOrder" },
];

const EDIT_FIELDS_AFTER_MOTHER = [
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
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">(
    "vertical"
  );
  const [showOptions, setShowOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    label: string;
    onConfirm: () => void;
  } | null>(null);

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

    f3Chart
      .setTransitionTime(400)
      .setCardXSpacing(240)
      .setCardYSpacing(150)
      .setSingleParentEmptyCard(false);

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
      const motherSelectField = {
        type: "select",
        label: "어머니 선택",
        id: "motherId",
        placeholder: "선택 안 함",
        optionCreator: (datum: FamilyChartDatum & { _new_rel_data?: { rel_type: string; rel_id?: string; other_parent_id?: string } }) => {
          if (
            datum._new_rel_data &&
            datum._new_rel_data.rel_type !== "son" &&
            datum._new_rel_data.rel_type !== "daughter"
          ) {
            return [];
          }

          const storeData = f3Chart.store.getData() as unknown as FamilyChartDatum[];
          const parentNodes = (datum.rels?.parents ?? [])
            .map((pid) => storeData.find((d) => d.id === pid))
            .filter((d): d is FamilyChartDatum => Boolean(d));

          const relParent = datum._new_rel_data?.rel_id
            ? storeData.find((d) => d.id === datum._new_rel_data?.rel_id)
            : undefined;
          const allParents = [...parentNodes];
          if (relParent && !allParents.some((p) => p.id === relParent.id)) {
            allParents.push(relParent);
          }

          const father =
            allParents.find((p) => p.data.gender !== "F") ?? allParents[0];
          if (!father) return [];

          const currentMotherId =
            datum._new_rel_data?.other_parent_id ||
            allParents.find((p) => p.id !== father.id && p.data.gender === "F")?.id ||
            datum.data?.motherId ||
            "";

          const candidateIds = new Set<string>(father.rels?.spouses ?? []);
          if (currentMotherId) candidateIds.add(currentMotherId);

          const options = Array.from(candidateIds)
            .map((id) => storeData.find((d) => d.id === id))
            .filter(
              (d): d is FamilyChartDatum =>
                d !== undefined &&
                !d.unknown &&
                !d.to_add &&
                !(d as { _new_rel_data?: unknown })._new_rel_data
            )
            .map((cand) => {
              const { primary, secondary } = formatPersonDisplayName({
                nameKo: cand.data.nameKo || null,
                nameHanja: cand.data.nameHanja || null,
                surnameKo: cand.data.surnameKo || null,
                bonKo: cand.data.bonKo || null,
              });
              return {
                value: cand.id,
                label: secondary ? `${primary} (${secondary})` : primary,
              };
            });

          // If there is exactly 1 mother candidate, default motherId to her
          if (options.length === 1 && !datum.data.motherId) {
            datum.data.motherId = options[0].value;
          }

          return options;
        },
      };

      const f3EditTree = f3Chart
        .editTree()
        .setFields([
          ...EDIT_FIELDS_BEFORE_MOTHER,
          motherSelectField,
          ...EDIT_FIELDS_AFTER_MOTHER,
        ] as unknown as string[])
        .setEditFirst(true)
        .setCardClickOpen(f3Card)
        .setOnFormCreation(({ cont }) => {
          const buttonsEl = cont.querySelector<HTMLElement>(".f3-form-buttons");
          const nativeCloseBtn = cont.querySelector<HTMLElement>(".f3-close-btn");
          if (
            buttonsEl &&
            nativeCloseBtn &&
            !buttonsEl.querySelector(".f3-form-close-btn")
          ) {
            const closeBtn = document.createElement("button");
            closeBtn.type = "button";
            closeBtn.className = "f3-form-close-btn";
            closeBtn.textContent = "Close";
            closeBtn.addEventListener("click", () => {
              nativeCloseBtn.click();
            });
            buttonsEl.prepend(closeBtn);
          }

          const select = cont.querySelector<HTMLSelectElement>(
            'select[name="motherId"]'
          );
          const fieldEl = select?.closest<HTMLElement>(".f3-form-field");
          if (!select || !fieldEl) return;

          // 1 placeholder ("선택 안 함") + 1 mother => default to her and hide dropdown
          if (select.options.length === 2) {
            select.value = select.options[1].value;
            fieldEl.style.display = "none";
          } else if (select.options.length < 3) {
            fieldEl.style.display = "none";
          }
        })
        .setOnDelete((datum, deletePerson, postSubmit) => {
          const data = (datum as unknown as FamilyChartDatum).data;
          const { primary, secondary } = formatPersonDisplayName({
            nameKo: data?.nameKo || null,
            nameHanja: data?.nameHanja || null,
            surnameKo: data?.surnameKo || null,
            bonKo: data?.bonKo || null,
          });
          const label = secondary ? `${primary} (${secondary})` : primary;
          setPendingDelete({
            label,
            onConfirm: () => {
              deletePerson();
              postSubmit({});
            },
          });
        })
        .setOnChange(async () => {
          // Sync rels.parents and mother.rels.children with any motherId change from the select field
          const storeData = f3Chart.store.getData() as unknown as FamilyChartDatum[];
          let relsUpdated = false;
          for (const node of storeData) {
            if (node.unknown || node.to_add) continue;
            const selectedMotherId = node.data?.motherId || "";
            const parentNodes = (node.rels?.parents ?? [])
              .map((pid) => storeData.find((d) => d.id === pid))
              .filter((d): d is FamilyChartDatum => Boolean(d));
            const father = parentNodes.find((p) => p.data.gender !== "F");
            if (!father) continue;
            const currentMother = parentNodes.find(
              (p) => p.id !== father.id && p.data.gender === "F"
            );
            if ((currentMother?.id ?? "") !== selectedMotherId) {
              if (currentMother) {
                currentMother.rels.children = (currentMother.rels.children ?? []).filter(
                  (cid) => cid !== node.id
                );
              }
              node.rels.parents = (node.rels.parents ?? []).filter(
                (pid) => pid === father.id
              );
              if (selectedMotherId) {
                const nextMother = storeData.find((d) => d.id === selectedMotherId);
                if (nextMother) {
                  node.rels.parents.push(nextMother.id);
                  nextMother.rels.children = nextMother.rels.children ?? [];
                  if (!nextMother.rels.children.includes(node.id)) {
                    nextMother.rels.children.push(node.id);
                  }
                }
              }
              relsUpdated = true;
            }
          }
          if (relsUpdated) {
            f3Chart.updateTree({});
          }

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

    if (orientation === "horizontal") {
      f3Chart.setOrientationHorizontal();
    } else {
      f3Chart.setOrientationVertical();
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

  // Sync tree orientation without tearing down chart
  useEffect(() => {
    const f3Chart = chartRef.current;
    if (!f3Chart) return;
    if (orientation === "horizontal") {
      f3Chart.setOrientationHorizontal();
    } else {
      f3Chart.setOrientationVertical();
    }
    f3Chart.updateTree({});
  }, [orientation]);

  const activeOptionSummary = useMemo(() => {
    const parts: string[] = [];
    if (ancestryDepth !== null) parts.push(`상위 ${ancestryDepth}대`);
    if (progenyDepth !== null) parts.push(`하위 ${progenyDepth}대`);
    if (childOrderMode !== tree.childOrderMode) {
      parts.push(
        childOrderMode === "BY_GENDER_THEN_ORDER" ? "성별+순번" : "순번순"
      );
    }
    if (orientation === "horizontal") parts.push("가로");
    return parts.join(" · ");
  }, [ancestryDepth, progenyDepth, childOrderMode, tree.childOrderMode, orientation]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col items-start gap-2">
        <div className="flex w-full items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={showOptions}
            aria-controls="tree-view-options"
            onClick={() => setShowOptions((prev) => !prev)}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)]/95 px-3.5 py-1.5 text-sm font-medium text-[var(--text-primary)] shadow-sm backdrop-blur-sm transition hover:bg-[var(--bg-muted)]"
          >
            <span>보기 옵션</span>
            {activeOptionSummary && (
              <span className="rounded-full bg-blue-600/15 px-2 py-0.5 text-xs text-blue-600">
                {activeOptionSummary}
              </span>
            )}
            <span className="text-xs text-[var(--text-secondary)]">
              {showOptions ? "▴" : "▾"}
            </span>
          </button>

          <div className="pointer-events-auto flex items-center gap-2">
            {saving && (
              <span className="rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)]/95 px-3 py-1 text-xs font-medium text-blue-500 shadow-sm backdrop-blur-sm">
                저장 중...
              </span>
            )}
            {errorMsg && (
              <span className="rounded-full border border-red-500/30 bg-[var(--bg-surface)]/95 px-3 py-1 text-xs font-medium text-red-500 shadow-sm backdrop-blur-sm">
                {errorMsg}
              </span>
            )}
          </div>
        </div>

        {showOptions && (
          <div
            id="tree-view-options"
            className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)]/95 px-4 py-2.5 text-sm shadow-md backdrop-blur-sm"
          >
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

            <label className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span>트리 방향</span>
              <select
                value={orientation}
                onChange={(e) =>
                  setOrientation(e.target.value as "vertical" | "horizontal")
                }
                className="rounded border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-sm text-[var(--text-primary)]"
              >
                <option value="vertical">세로 방향</option>
                <option value="horizontal">가로 방향</option>
              </select>
            </label>
          </div>
        )}
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

      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 text-[var(--text-primary)] shadow-xl">
            <h3 className="text-base font-semibold">인물 삭제 확인</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              <strong className="font-semibold text-[var(--text-primary)]">
                {pendingDelete.label}
              </strong>{" "}
              항목을 삭제하시겠습니까?
            </p>
            <div className="mt-5 flex justify-end gap-2 text-sm">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-1.5 hover:bg-[var(--bg-muted)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const confirmFn = pendingDelete.onConfirm;
                  setPendingDelete(null);
                  confirmFn();
                }}
                className="rounded-lg bg-red-600 px-4 py-1.5 font-medium text-white hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

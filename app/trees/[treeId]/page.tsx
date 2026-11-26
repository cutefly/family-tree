"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FamilyTree, Marriage, Person } from "@prisma/client";
import { FamilyTreeCanvas } from "@/components/FamilyTreeCanvas";
import { ThemeSelector } from "@/components/ThemeSelector";
import { TreeMembersModal } from "@/components/TreeMembersModal";
import { TreeSettingsModal } from "@/components/TreeSettingsModal";
import type { FamilyChartDatum } from "@/lib/family-graph";

type EffectiveRole = "ADMIN" | "OWNER" | "EDITOR" | "VIEWER";

type FullTree = FamilyTree & {
  persons: Person[];
  marriages: Marriage[];
};

const ROLE_LABELS: Record<EffectiveRole, string> = {
  ADMIN: "관리자",
  OWNER: "소유자",
  EDITOR: "편집자",
  VIEWER: "열람자",
};

export default function TreeDetailPage() {
  const params = useParams<{ treeId: string }>();
  const router = useRouter();
  const [tree, setTree] = useState<FullTree | null>(null);
  const [myRole, setMyRole] = useState<EffectiveRole>("VIEWER");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "view">("view");
  const [showSettings, setShowSettings] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const canEdit = myRole === "ADMIN" || myRole === "OWNER" || myRole === "EDITOR";
  const canManage = myRole === "ADMIN" || myRole === "OWNER";

  useEffect(() => {
    fetch(`/api/trees/${params.treeId}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return null;
        }
        const json = await res.json();
        if (!res.ok) {
          setLoadError(json.error ?? "가계도를 불러올 수 없습니다.");
          return null;
        }
        return json;
      })
      .then((json) => {
        if (json?.tree) setTree(json.tree);
        if (json?.myRole) {
          const role = json.myRole as EffectiveRole;
          setMyRole(role);
          setMode(role === "VIEWER" ? "view" : "edit");
        }
      })
      .catch(() => {
        setLoadError("가계도를 불러오는 중 네트워크 오류가 발생했습니다.");
      });
  }, [params.treeId, router]);

  const handleGraphChange = useCallback(
    async (nodes: FamilyChartDatum[]) => {
      const res = await fetch(`/api/trees/${params.treeId}/graph`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "가계도 저장 실패");
      }
      setTree(json.tree);
    },
    [params.treeId]
  );

  if (loadError) {
    return (
      <div className="p-6 text-sm text-red-600">
        {loadError}{" "}
        <Link href="/trees" className="ml-2 text-blue-600 underline">
          목록으로
        </Link>
      </div>
    );
  }

  if (!tree) {
    return <div className="p-6 text-sm text-[var(--text-secondary)]">가계도를 불러오는 중...</div>;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/trees" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            ← 목록
          </Link>
          <h1 className="text-lg font-bold">{tree.title}</h1>
          {(tree.bonKo || tree.surnameKo) && (
            <span className="rounded bg-[var(--bg-muted)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
              {[tree.bonKo, tree.surnameKo ? `${tree.surnameKo}씨` : null]
                .filter(Boolean)
                .join(" ")}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded bg-blue-600/15 px-2.5 py-1 text-xs font-medium text-blue-600">
            {ROLE_LABELS[myRole]}
          </span>
          <ThemeSelector />
          {canEdit && (
            <div className="flex overflow-hidden rounded-lg border border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setMode("edit")}
                className={`px-3 py-1 ${
                  mode === "edit"
                    ? "bg-blue-600 text-white"
                    : "bg-[var(--bg-surface)] text-[var(--text-primary)]"
                }`}
              >
                작성/편집
              </button>
              <button
                type="button"
                onClick={() => setMode("view")}
                className={`px-3 py-1 ${
                  mode === "view"
                    ? "bg-blue-600 text-white"
                    : "bg-[var(--bg-surface)] text-[var(--text-primary)]"
                }`}
              >
                보기
              </button>
            </div>
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => setShowMembers(true)}
              className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-1 hover:bg-[var(--bg-muted)]"
            >
              멤버 관리
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-1 hover:bg-[var(--bg-muted)]"
            >
              {canManage ? "글로벌 설정 / 공유" : "가계도 설정"}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <FamilyTreeCanvas
          persons={tree.persons}
          marriages={tree.marriages}
          tree={tree}
          mode={canEdit ? mode : "view"}
          onGraphChange={handleGraphChange}
        />
      </div>

      {showSettings && canEdit && (
        <TreeSettingsModal
          tree={tree}
          canManageSharing={canManage}
          onClose={() => setShowSettings(false)}
          onUpdated={(updated) => setTree((prev) => (prev ? { ...prev, ...updated } : prev))}
        />
      )}

      {showMembers && canManage && (
        <TreeMembersModal
          treeId={tree.id}
          myRole={myRole}
          onClose={() => setShowMembers(false)}
        />
      )}
    </div>
  );
}

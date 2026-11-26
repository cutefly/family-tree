"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminUserAssignmentPanel } from "@/components/AdminUserAssignmentPanel";
import { ThemeSelector } from "@/components/ThemeSelector";

type EffectiveRole = "ADMIN" | "OWNER" | "EDITOR" | "VIEWER";

interface TreeSummary {
  id: string;
  title: string;
  bonKo: string | null;
  bonHanja: string | null;
  surnameKo: string | null;
  surnameHanja: string | null;
  isShared: boolean;
  myRole: EffectiveRole;
  _count: { persons: number };
}

interface CurrentUserInfo {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
}

const ROLE_LABELS: Record<EffectiveRole, string> = {
  ADMIN: "관리자",
  OWNER: "소유자",
  EDITOR: "편집자",
  VIEWER: "열람자",
};

export default function TreesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUserInfo | null>(null);
  const [trees, setTrees] = useState<TreeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [bonKo, setBonKo] = useState("");
  const [bonHanja, setBonHanja] = useState("");
  const [surnameKo, setSurnameKo] = useState("");
  const [surnameHanja, setSurnameHanja] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [meRes, treesRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/trees"),
      ]);
      if (meRes.status === 401 || treesRes.status === 401) {
        router.replace("/login");
        return;
      }
      const [meJson, treesJson] = await Promise.all([
        meRes.json(),
        treesRes.json(),
      ]);
      if (meJson?.user) setCurrentUser(meJson.user);
      if (treesJson?.trees) setTrees(treesJson.trees);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/trees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, bonKo, bonHanja, surnameKo, surnameHanja }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "가계도 생성에 실패했습니다.");
      return;
    }
    router.push(`/trees/${json.tree.id}`);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">내 가계도 목록</h1>
        <div className="flex items-center gap-3">
          <ThemeSelector />
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm hover:bg-[var(--bg-muted)]"
          >
            로그아웃
          </button>
        </div>
      </div>

      {currentUser?.role === "ADMIN" && (
        <>
          <section className="mb-8 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold">새 가계도 만들기</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block font-medium">가계도 이름</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 우리집 족보"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium">대표 본관 (한글)</label>
            <input
              value={bonKo}
              onChange={(e) => setBonKo(e.target.value)}
              placeholder="예: 김해"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium">대표 본관 (한자)</label>
            <input
              value={bonHanja}
              onChange={(e) => setBonHanja(e.target.value)}
              placeholder="예: 金海"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium">대표 성씨 (한글)</label>
            <input
              value={surnameKo}
              onChange={(e) => setSurnameKo(e.target.value)}
              placeholder="예: 김"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium">대표 성씨 (한자)</label>
            <input
              value={surnameHanja}
              onChange={(e) => setSurnameHanja(e.target.value)}
              placeholder="예: 金"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end pt-1">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700"
            >
              생성
            </button>
          </div>
        </form>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </section>
          <AdminUserAssignmentPanel trees={trees} onAssigned={loadData} />
        </>
      )}

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">불러오는 중...</p>
      ) : trees.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 text-sm text-[var(--text-secondary)]">
          {currentUser?.role === "ADMIN"
            ? "아직 생성된 가계도가 없습니다."
            : "아직 배정된 가계도가 없습니다. 관리자가 소속 가계와 역할을 설정하면 이용할 수 있습니다."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {trees.map((tree) => (
            <Link
              key={tree.id}
              href={`/trees/${tree.id}`}
              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 shadow-sm transition hover:border-blue-500"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{tree.title}</h3>
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-blue-600/15 px-2 py-0.5 text-xs font-medium text-blue-600">
                    {ROLE_LABELS[tree.myRole]}
                  </span>
                  <span className="rounded bg-[var(--bg-muted)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                    {tree._count.persons}명
                  </span>
                </div>
              </div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {[
                  tree.bonKo ? `${tree.bonKo}${tree.bonHanja ? `(${tree.bonHanja})` : ""}` : null,
                  tree.surnameKo
                    ? `${tree.surnameKo}${tree.surnameHanja ? `(${tree.surnameHanja})` : ""}씨`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ") || "본관·성씨 미설정"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

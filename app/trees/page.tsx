"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeSelector } from "@/components/ThemeSelector";

interface TreeSummary {
  id: string;
  title: string;
  bonKo: string | null;
  bonHanja: string | null;
  surnameKo: string | null;
  surnameHanja: string | null;
  isShared: boolean;
  _count: { persons: number };
}

export default function TreesPage() {
  const router = useRouter();
  const [trees, setTrees] = useState<TreeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [bonKo, setBonKo] = useState("");
  const [bonHanja, setBonHanja] = useState("");
  const [surnameKo, setSurnameKo] = useState("");
  const [surnameHanja, setSurnameHanja] = useState("");

  useEffect(() => {
    fetch("/api/trees")
      .then((res) => {
        if (res.status === 401) {
          router.replace("/login");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (json?.trees) setTrees(json.trees);
      })
      .finally(() => setLoading(false));
  }, [router]);

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

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">불러오는 중...</p>
      ) : trees.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">아직 생성된 가계도가 없습니다.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {trees.map((tree) => (
            <Link
              key={tree.id}
              href={`/trees/${tree.id}`}
              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 shadow-sm transition hover:border-blue-500"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{tree.title}</h3>
                <span className="rounded bg-[var(--bg-muted)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                  {tree._count.persons}명
                </span>
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

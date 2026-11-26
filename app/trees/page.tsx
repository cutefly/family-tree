"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
    const res = await fetch("/api/trees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, bonKo, bonHanja, surnameKo, surnameHanja }),
    });
    if (res.ok) {
      const json = await res.json();
      router.push(`/trees/${json.tree.id}`);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">내 가계도 목록</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          로그아웃
        </button>
      </div>

      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">새 가계도 만들기</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-5">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="가계도 이름 (예: 우리집 족보)"
            className="rounded-lg border border-slate-300 px-3 py-2 sm:col-span-5"
          />
          <input
            value={bonKo}
            onChange={(e) => setBonKo(e.target.value)}
            placeholder="본관 한글 (예: 김해)"
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
          <input
            value={bonHanja}
            onChange={(e) => setBonHanja(e.target.value)}
            placeholder="본관 한자 (예: 金海)"
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
          <input
            value={surnameKo}
            onChange={(e) => setSurnameKo(e.target.value)}
            placeholder="성씨 한글 (예: 김)"
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
          <input
            value={surnameHanja}
            onChange={(e) => setSurnameHanja(e.target.value)}
            placeholder="성씨 한자 (예: 金)"
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            생성
          </button>
        </form>
      </section>

      {loading ? (
        <p className="text-sm text-slate-500">불러오는 중...</p>
      ) : trees.length === 0 ? (
        <p className="text-sm text-slate-500">아직 생성된 가계도가 없습니다.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {trees.map((tree) => (
            <Link
              key={tree.id}
              href={`/trees/${tree.id}`}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-400"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{tree.title}</h3>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {tree._count.persons}명
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
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

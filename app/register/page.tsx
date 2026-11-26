"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeSelector } from "@/components/ThemeSelector";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "회원가입에 실패했습니다.");
        return;
      }
      router.push("/trees");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-4 flex w-full max-w-sm justify-end">
        <ThemeSelector />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold">회원가입</h1>
        <p className="mb-5 text-sm text-[var(--text-secondary)]">
          새 가계도를 만들고 가족과 공유해 보세요.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block font-medium">이름</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium">이메일</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium">비밀번호</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2"
            />
          </div>
          {error && <p className="text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-medium text-blue-500 hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </main>
  );
}

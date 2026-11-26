"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { FamilyTree, Marriage, Person } from "@prisma/client";
import { FamilyTreeCanvas } from "@/components/FamilyTreeCanvas";
import { ThemeSelector } from "@/components/ThemeSelector";

type SharedTree = Pick<
  FamilyTree,
  "id" | "title" | "bonKo" | "bonHanja" | "surnameKo" | "surnameHanja" | "childOrderMode" | "rootPersonId"
> & {
  persons: Person[];
  marriages: Marriage[];
};

export default function ShareTreePage() {
  const params = useParams<{ token: string }>();
  const [tree, setTree] = useState<SharedTree | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/share/${params.token}`)
      .then((res) => {
        if (!res.ok) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (json?.tree) setTree(json.tree);
      });
  }, [params.token]);

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold">공유된 가계도를 찾을 수 없습니다</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            링크가 만료되었거나 공유가 비활성화되었습니다.
          </p>
        </div>
      </main>
    );
  }

  if (!tree) {
    return <div className="p-6 text-sm text-[var(--text-secondary)]">가계도를 불러오는 중...</div>;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">{tree.title}</h1>
          <span className="rounded bg-[var(--bg-muted)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
            읽기 전용
          </span>
        </div>
        <ThemeSelector />
      </header>

      <div className="flex-1 overflow-hidden">
        <FamilyTreeCanvas
          persons={tree.persons}
          marriages={tree.marriages}
          tree={tree}
          mode="view"
        />
      </div>
    </div>
  );
}

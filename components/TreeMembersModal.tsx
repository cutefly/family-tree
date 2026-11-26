"use client";

import { useCallback, useEffect, useState } from "react";

type TreeRole = "OWNER" | "EDITOR" | "VIEWER";

interface MemberItem {
  userId: string;
  email: string;
  name: string;
  role: TreeRole;
}

interface TreeMembersModalProps {
  treeId: string;
  myRole: "ADMIN" | TreeRole;
  onClose: () => void;
}

export function TreeMembersModal({
  treeId,
  myRole,
  onClose,
}: TreeMembersModalProps) {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TreeRole>("VIEWER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = myRole === "ADMIN";

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trees/${treeId}/members`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "멤버 목록을 불러오지 못했습니다.");
        return;
      }
      setMembers(json.members ?? []);
    } catch {
      setError("멤버 목록 조회 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [treeId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/trees/${treeId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "멤버 추가에 실패했습니다.");
        return;
      }
      setEmail("");
      await loadMembers();
    } catch {
      setError("멤버 추가 중 네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange(userId: string, nextRole: TreeRole) {
    setError(null);
    try {
      const res = await fetch(`/api/trees/${treeId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "역할 변경에 실패했습니다.");
        return;
      }
      await loadMembers();
    } catch {
      setError("역할 변경 중 네트워크 오류가 발생했습니다.");
    }
  }

  async function handleRemove(userId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/trees/${treeId}/members/${userId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "멤버 제거에 실패했습니다.");
        return;
      }
      await loadMembers();
    } catch {
      setError("멤버 제거 중 네트워크 오류가 발생했습니다.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-6 text-[var(--text-primary)] shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">가계도 멤버 및 권한 관리</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            닫기
          </button>
        </div>

        <form onSubmit={handleAdd} className="mb-4 flex flex-wrap gap-2 text-sm">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="가입된 사용자 이메일"
            className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-1.5"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as TreeRole)}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2.5 py-1.5"
          >
            {isAdmin && <option value="OWNER">소유자</option>}
            <option value="EDITOR">편집자</option>
            <option value="VIEWER">열람자</option>
          </select>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-3.5 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "추가 중..." : "추가"}
          </button>
        </form>

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">불러오는 중...</p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {members.map((m) => {
              const canModify = isAdmin || m.role !== "OWNER";
              return (
                <div
                  key={m.userId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-muted)] px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{m.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      disabled={!canModify}
                      value={m.role}
                      onChange={(e) =>
                        handleRoleChange(m.userId, e.target.value as TreeRole)
                      }
                      className="rounded border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs disabled:opacity-60"
                    >
                      {(isAdmin || m.role === "OWNER") && (
                        <option value="OWNER">소유자</option>
                      )}
                      <option value="EDITOR">편집자</option>
                      <option value="VIEWER">열람자</option>
                    </select>
                    {canModify && (
                      <button
                        type="button"
                        onClick={() => handleRemove(m.userId)}
                        className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10"
                      >
                        제거
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

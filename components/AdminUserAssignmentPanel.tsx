"use client";

import { useCallback, useEffect, useState } from "react";

type TreeRole = "OWNER" | "EDITOR" | "VIEWER";

interface AdminUserMembership {
  treeId: string;
  treeTitle: string;
  role: TreeRole;
}

interface AdminUserItem {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  createdAt: string;
  memberships: AdminUserMembership[];
}

interface TreeOption {
  id: string;
  title: string;
}

interface AdminUserAssignmentPanelProps {
  trees: TreeOption[];
  onAssigned?: () => void;
}

const ROLE_LABELS: Record<TreeRole, string> = {
  OWNER: "소유자",
  EDITOR: "편집자",
  VIEWER: "열람자",
};

export function AdminUserAssignmentPanel({
  trees,
  onAssigned,
}: AdminUserAssignmentPanelProps) {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTreeByUser, setSelectedTreeByUser] = useState<Record<string, string>>({});
  const [selectedRoleByUser, setSelectedRoleByUser] = useState<Record<string, TreeRole>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/users${unassignedOnly ? "?unassigned=true" : ""}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "사용자 목록을 불러오지 못했습니다.");
        return;
      }
      setUsers(json.users ?? []);
    } catch {
      setError("사용자 목록 조회 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [unassignedOnly]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleAssign(user: AdminUserItem) {
    const treeId = selectedTreeByUser[user.id] || trees[0]?.id;
    const role = selectedRoleByUser[user.id] || "VIEWER";
    if (!treeId) {
      setError("먼저 가계도를 생성해 주세요.");
      return;
    }

    setBusyUserId(user.id);
    setError(null);
    try {
      const res = await fetch(`/api/trees/${treeId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, role }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "권한 배정에 실패했습니다.");
        return;
      }
      await loadUsers();
      onAssigned?.();
    } catch {
      setError("권한 배정 중 네트워크 오류가 발생했습니다.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemoveMembership(userId: string, treeId: string) {
    setBusyUserId(userId);
    setError(null);
    try {
      const res = await fetch(`/api/trees/${treeId}/members/${userId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "소속 해제에 실패했습니다.");
        return;
      }
      await loadUsers();
      onAssigned?.();
    } catch {
      setError("소속 해제 중 네트워크 오류가 발생했습니다.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">사용자 소속 가계 · 권한 관리 (ADMIN)</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            회원가입한 사용자의 소속 가계도와 역할(소유자/편집자/열람자)을 설정합니다.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => setUnassignedOnly(e.target.checked)}
          />
          미배정 사용자만 보기
        </label>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">사용자 목록을 불러오는 중...</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">표시할 사용자가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex flex-col gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-muted)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{u.name}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{u.email}</span>
                  {u.role === "ADMIN" && (
                    <span className="rounded bg-purple-600/15 px-1.5 py-0.5 text-[11px] font-medium text-purple-600">
                      ADMIN
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {u.memberships.length === 0 ? (
                    <span className="text-xs text-amber-600">배정된 가계도 없음</span>
                  ) : (
                    u.memberships.map((m) => (
                      <span
                        key={m.treeId}
                        className="inline-flex items-center gap-1 rounded border border-[var(--border-color)] bg-[var(--bg-surface)] px-2 py-0.5 text-xs"
                      >
                        <span>{m.treeTitle}</span>
                        <span className="text-[var(--text-secondary)]">
                          ({ROLE_LABELS[m.role]})
                        </span>
                        <button
                          type="button"
                          disabled={busyUserId === u.id}
                          onClick={() => handleRemoveMembership(u.id, m.treeId)}
                          className="ml-1 text-red-500 hover:text-red-700"
                          title="소속 해제"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {trees.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedTreeByUser[u.id] || trees[0]?.id || ""}
                    onChange={(e) =>
                      setSelectedTreeByUser((prev) => ({
                        ...prev,
                        [u.id]: e.target.value,
                      }))
                    }
                    className="rounded border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs"
                  >
                    {trees.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedRoleByUser[u.id] || "VIEWER"}
                    onChange={(e) =>
                      setSelectedRoleByUser((prev) => ({
                        ...prev,
                        [u.id]: e.target.value as TreeRole,
                      }))
                    }
                    className="rounded border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs"
                  >
                    <option value="OWNER">소유자</option>
                    <option value="EDITOR">편집자</option>
                    <option value="VIEWER">열람자</option>
                  </select>
                  <button
                    type="button"
                    disabled={busyUserId === u.id}
                    onClick={() => handleAssign(u)}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    배정/변경
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

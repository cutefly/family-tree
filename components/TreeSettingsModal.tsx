"use client";

import { useState } from "react";
import type { ChildOrderMode, FamilyTree } from "@prisma/client";

interface TreeSettingsModalProps {
  tree: FamilyTree;
  onClose: () => void;
  onUpdated: (updated: FamilyTree) => void;
}

export function TreeSettingsModal({
  tree,
  onClose,
  onUpdated,
}: TreeSettingsModalProps) {
  const [title, setTitle] = useState(tree.title);
  const [bonKo, setBonKo] = useState(tree.bonKo ?? "");
  const [bonHanja, setBonHanja] = useState(tree.bonHanja ?? "");
  const [surnameKo, setSurnameKo] = useState(tree.surnameKo ?? "");
  const [surnameHanja, setSurnameHanja] = useState(tree.surnameHanja ?? "");
  const [childOrderMode, setChildOrderMode] = useState<ChildOrderMode>(
    tree.childOrderMode
  );
  const [isShared, setIsShared] = useState(tree.isShared);
  const [shareToken, setShareToken] = useState(tree.shareToken);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/${shareToken}`
      : `/share/${shareToken}`;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/trees/${tree.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          bonKo,
          bonHanja,
          surnameKo,
          surnameHanja,
          childOrderMode,
          isShared,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "설정 저장에 실패했습니다.");
        return;
      }
      onUpdated(json.tree);
      onClose();
    } catch {
      setError("설정 저장 중 네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateToken() {
    setError(null);
    try {
      const res = await fetch(`/api/trees/${tree.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateShareToken: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "토큰 재발급에 실패했습니다.");
        return;
      }
      setShareToken(json.tree.shareToken);
      onUpdated(json.tree);
    } catch {
      setError("토큰 재발급 중 네트워크 오류가 발생했습니다.");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("클립보드 복사에 실패했습니다. URL을 직접 복사해 주세요.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">가계도 글로벌 설정</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            닫기
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block font-medium">가계도 이름</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-medium">대표 본관 (한글)</label>
              <input
                value={bonKo}
                onChange={(e) => setBonKo(e.target.value)}
                placeholder="예: 김해"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium">대표 본관 (한자)</label>
              <input
                value={bonHanja}
                onChange={(e) => setBonHanja(e.target.value)}
                placeholder="예: 金海"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium">대표 성씨 (한글)</label>
              <input
                value={surnameKo}
                onChange={(e) => setSurnameKo(e.target.value)}
                placeholder="예: 김"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium">대표 성씨 (한자)</label>
              <input
                value={surnameHanja}
                onChange={(e) => setSurnameHanja(e.target.value)}
                placeholder="예: 金"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-medium">기본 자녀 나열 방식</label>
            <select
              value={childOrderMode}
              onChange={(e) =>
                setChildOrderMode(e.target.value as ChildOrderMode)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="BY_ORDER">순번순</option>
              <option value="BY_GENDER_THEN_ORDER">성별+순번순</option>
            </select>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
              />
              읽기 전용 공유 링크 활성화
            </label>
            {isShared && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded bg-slate-800 px-2.5 py-1 text-xs text-white"
                >
                  {copied ? "복사됨" : "복사"}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateToken}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs"
                >
                  재발급
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

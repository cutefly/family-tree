import { beforeEach, describe, expect, it, vi } from "vitest";
import { signSessionToken } from "@/lib/auth";

const { mockCookieGet, mockPrisma } = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockPrisma: {
    user: { findUnique: vi.fn() },
    familyTree: { findUnique: vi.fn() },
    treeMember: { findUnique: vi.fn() },
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

function setSessionCookie(userId: string, email: string) {
  const token = signSessionToken({ userId, email });
  mockCookieGet.mockReturnValue({ value: token });
}

describe("lib/tree-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requireAdmin returns 401 when unauthenticated", async () => {
    mockCookieGet.mockReturnValue(undefined);

    const { requireAdmin } = await import("@/lib/tree-auth");
    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(401);
    }
  });

  it("requireAdmin returns 403 for USER role and passes for ADMIN role", async () => {
    setSessionCookie("u1", "u1@test.com");

    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "u1@test.com",
      name: "일반",
      role: "USER",
    });

    const { requireAdmin } = await import("@/lib/tree-auth");
    const denied = await requireAdmin();
    expect("error" in denied).toBe(true);
    if ("error" in denied) {
      expect(denied.error.status).toBe(403);
    }

    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "u1@test.com",
      name: "관리자",
      role: "ADMIN",
    });
    const allowed = await requireAdmin();
    expect("user" in allowed).toBe(true);
    if ("user" in allowed) {
      expect(allowed.user.role).toBe("ADMIN");
    }
  });

  it("requireTreeAccess allows ADMIN without TreeMember row", async () => {
    setSessionCookie("admin-1", "admin@test.com");
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin@test.com",
      name: "관리자",
      role: "ADMIN",
    });
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-1",
      ownerId: "someone-else",
    });

    const { requireTreeAccess } = await import("@/lib/tree-auth");
    const result = await requireTreeAccess("tree-1", "OWNER");
    expect("tree" in result).toBe(true);
    if ("tree" in result) {
      expect(result.role).toBe("ADMIN");
    }
    expect(mockPrisma.treeMember.findUnique).not.toHaveBeenCalled();
  });

  it("requireTreeAccess returns 404 when tree does not exist", async () => {
    setSessionCookie("u1", "u1@test.com");
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "u1@test.com",
      name: "유저",
      role: "USER",
    });
    mockPrisma.familyTree.findUnique.mockResolvedValue(null);

    const { requireTreeAccess } = await import("@/lib/tree-auth");
    const result = await requireTreeAccess("missing", "VIEWER");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(404);
    }
  });

  it("requireTreeAccess enforces VIEWER < EDITOR < OWNER hierarchy and blocks unassigned USER", async () => {
    setSessionCookie("u1", "u1@test.com");
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "u1@test.com",
      name: "유저",
      role: "USER",
    });
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-1",
      ownerId: "owner-1",
    });

    const { requireTreeAccess } = await import("@/lib/tree-auth");

    // Unassigned -> 403
    mockPrisma.treeMember.findUnique.mockResolvedValueOnce(null);
    const unassigned = await requireTreeAccess("tree-1", "VIEWER");
    expect("error" in unassigned && unassigned.error.status).toBe(403);

    // VIEWER -> VIEWER ok, EDITOR 403
    mockPrisma.treeMember.findUnique.mockResolvedValueOnce({ role: "VIEWER" });
    const viewerOk = await requireTreeAccess("tree-1", "VIEWER");
    expect("role" in viewerOk && viewerOk.role).toBe("VIEWER");

    mockPrisma.treeMember.findUnique.mockResolvedValueOnce({ role: "VIEWER" });
    const viewerDenied = await requireTreeAccess("tree-1", "EDITOR");
    expect("error" in viewerDenied && viewerDenied.error.status).toBe(403);

    // EDITOR -> EDITOR ok, OWNER 403
    mockPrisma.treeMember.findUnique.mockResolvedValueOnce({ role: "EDITOR" });
    const editorOk = await requireTreeAccess("tree-1", "EDITOR");
    expect("role" in editorOk && editorOk.role).toBe("EDITOR");

    mockPrisma.treeMember.findUnique.mockResolvedValueOnce({ role: "EDITOR" });
    const editorDenied = await requireTreeAccess("tree-1", "OWNER");
    expect("error" in editorDenied && editorDenied.error.status).toBe(403);

    // OWNER -> OWNER ok
    mockPrisma.treeMember.findUnique.mockResolvedValueOnce({ role: "OWNER" });
    const ownerOk = await requireTreeAccess("tree-1", "OWNER");
    expect("role" in ownerOk && ownerOk.role).toBe("OWNER");
  });
});

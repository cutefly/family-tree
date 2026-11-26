import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentUser, mockPrisma } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockPrisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    familyTree: {
      findUnique: vi.fn(),
    },
    treeMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

describe("Admin & Tree Member APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/admin/users returns 403 for USER and 200 with memberships for ADMIN", async () => {
    const { GET } = await import("@/app/api/admin/users/route");

    mockGetCurrentUser.mockResolvedValueOnce({
      id: "u1",
      email: "u1@test.com",
      name: "일반",
      role: "USER",
    });
    const denied = await GET(new Request("http://localhost/api/admin/users"));
    expect(denied.status).toBe(403);

    mockGetCurrentUser.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@test.com",
      name: "관리자",
      role: "ADMIN",
    });
    mockPrisma.user.findMany.mockResolvedValueOnce([
      {
        id: "u1",
        email: "u1@test.com",
        name: "일반",
        role: "USER",
        createdAt: new Date("2026-11-26T00:00:00Z"),
        memberships: [
          {
            role: "EDITOR",
            tree: { id: "t1", title: "김해 김씨" },
          },
        ],
      },
    ]);

    const res = await GET(new Request("http://localhost/api/admin/users"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.users).toHaveLength(1);
    expect(json.users[0].memberships[0]).toEqual({
      treeId: "t1",
      treeTitle: "김해 김씨",
      role: "EDITOR",
    });
  });

  it("POST /api/trees/[treeId]/members returns 404 for unknown email and normalizes email", async () => {
    const { POST } = await import("@/app/api/trees/[treeId]/members/route");

    mockGetCurrentUser.mockResolvedValue({
      id: "owner-1",
      email: "owner@test.com",
      name: "소유자",
      role: "USER",
    });
    mockPrisma.familyTree.findUnique.mockResolvedValue({ id: "t1", ownerId: "owner-1" });
    mockPrisma.treeMember.findUnique.mockResolvedValue({ role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const notFound = await POST(
      new Request("http://localhost/api/trees/t1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: " Unknown@Test.com ", role: "EDITOR" }),
      }),
      { params: Promise.resolve({ treeId: "t1" }) }
    );
    expect(notFound.status).toBe(404);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "unknown@test.com" } })
    );
  });

  it("POST /api/trees/[treeId]/members blocks OWNER from granting OWNER, allows ADMIN to grant OWNER", async () => {
    const { POST } = await import("@/app/api/trees/[treeId]/members/route");

    mockGetCurrentUser.mockResolvedValueOnce({
      id: "owner-1",
      email: "owner@test.com",
      name: "소유자",
      role: "USER",
    });
    mockPrisma.familyTree.findUnique.mockResolvedValue({ id: "t1", ownerId: "owner-1" });
    mockPrisma.treeMember.findUnique.mockResolvedValueOnce({ role: "OWNER" });
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u2",
      email: "u2@test.com",
      name: "멤버",
    });

    const denied = await POST(
      new Request("http://localhost/api/trees/t1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "u2@test.com", role: "OWNER" }),
      }),
      { params: Promise.resolve({ treeId: "t1" }) }
    );
    expect(denied.status).toBe(403);

    mockGetCurrentUser.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@test.com",
      name: "관리자",
      role: "ADMIN",
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u2",
      email: "u2@test.com",
      name: "멤버",
    });
    mockPrisma.treeMember.upsert.mockResolvedValueOnce({
      userId: "u2",
      treeId: "t1",
      role: "OWNER",
      user: { id: "u2", email: "u2@test.com", name: "멤버" },
    });

    const allowed = await POST(
      new Request("http://localhost/api/trees/t1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "u2@test.com", role: "OWNER" }),
      }),
      { params: Promise.resolve({ treeId: "t1" }) }
    );
    expect(allowed.status).toBe(201);
  });

  it("PATCH & DELETE /api/trees/[treeId]/members/[userId] guard OWNER escalation and last OWNER removal", async () => {
    const { PATCH, DELETE } = await import(
      "@/app/api/trees/[treeId]/members/[userId]/route"
    );

    mockGetCurrentUser.mockResolvedValue({
      id: "admin-1",
      email: "admin@test.com",
      name: "관리자",
      role: "ADMIN",
    });
    mockPrisma.familyTree.findUnique.mockResolvedValue({ id: "t1", ownerId: "owner-1" });

    // Target is the last OWNER -> cannot demote or delete
    mockPrisma.treeMember.findUnique.mockResolvedValueOnce({ role: "OWNER" });
    mockPrisma.treeMember.count.mockResolvedValueOnce(1);
    const demoteLast = await PATCH(
      new Request("http://localhost/api/trees/t1/members/owner-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "EDITOR" }),
      }),
      { params: Promise.resolve({ treeId: "t1", userId: "owner-1" }) }
    );
    expect(demoteLast.status).toBe(400);

    mockPrisma.treeMember.findUnique.mockResolvedValueOnce({ role: "OWNER" });
    mockPrisma.treeMember.count.mockResolvedValueOnce(1);
    const deleteLast = await DELETE(
      new Request("http://localhost/api/trees/t1/members/owner-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ treeId: "t1", userId: "owner-1" }) }
    );
    expect(deleteLast.status).toBe(400);

    // Non-owner target can be deleted by OWNER
    mockGetCurrentUser.mockResolvedValueOnce({
      id: "owner-1",
      email: "owner@test.com",
      name: "소유자",
      role: "USER",
    });
    mockPrisma.treeMember.findUnique
      .mockResolvedValueOnce({ role: "OWNER" }) // caller's role in requireTreeAccess
      .mockResolvedValueOnce({ role: "EDITOR" }); // target's role
    mockPrisma.treeMember.delete.mockResolvedValueOnce({ id: "m2" });

    const deleteOk = await DELETE(
      new Request("http://localhost/api/trees/t1/members/u2", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ treeId: "t1", userId: "u2" }) }
    );
    expect(deleteOk.status).toBe(200);
  });
});

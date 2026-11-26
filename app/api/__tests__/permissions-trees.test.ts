import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentUser, mockPrisma } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    familyTree: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getCurrentUser: () => mockGetCurrentUser(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

describe("Auth & /api/trees role permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_EMAIL;
  });

  it("POST /api/auth/register assigns ADMIN when email is in ADMIN_EMAIL and USER otherwise", async () => {
    process.env.ADMIN_EMAIL = "Admin@Test.com, boss@test.com";
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockImplementation(async ({ data }) => ({
      id: "u-new",
      email: data.email,
      name: data.name,
      role: data.role,
    }));

    const { POST } = await import("@/app/api/auth/register/route");

    const resAdmin = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@test.com",
          password: "pw",
          name: "관리자",
        }),
      })
    );
    expect(resAdmin.status).toBe(201);
    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "ADMIN" }),
      })
    );

    const resUser = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@test.com",
          password: "pw",
          name: "일반",
        }),
      })
    );
    expect(resUser.status).toBe(201);
    expect(mockPrisma.user.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "USER" }),
      })
    );
  });

  it("GET /api/auth/me returns user with role", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "u1",
      email: "u1@test.com",
      name: "홍길동",
      role: "ADMIN",
    });

    const { GET } = await import("@/app/api/auth/me/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.role).toBe("ADMIN");
  });

  it("GET /api/trees returns all trees with myRole ADMIN for ADMIN, and only member trees for USER", async () => {
    const { GET } = await import("@/app/api/trees/route");

    mockGetCurrentUser.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@test.com",
      name: "관리자",
      role: "ADMIN",
    });
    mockPrisma.familyTree.findMany.mockResolvedValueOnce([
      { id: "t1", title: "가계1", _count: { persons: 3, members: 2 } },
    ]);

    const adminRes = await GET();
    expect(adminRes.status).toBe(200);
    const adminJson = await adminRes.json();
    expect(adminJson.trees[0].myRole).toBe("ADMIN");

    mockGetCurrentUser.mockResolvedValueOnce({
      id: "user-1",
      email: "user@test.com",
      name: "유저",
      role: "USER",
    });
    mockPrisma.familyTree.findMany.mockResolvedValueOnce([
      {
        id: "t2",
        title: "가계2",
        _count: { persons: 5, members: 1 },
        members: [{ role: "EDITOR" }],
      },
    ]);

    const userRes = await GET();
    expect(userRes.status).toBe(200);
    const userJson = await userRes.json();
    expect(userJson.trees[0].myRole).toBe("EDITOR");
    expect(userJson.trees[0].members).toBeUndefined();
  });

  it("POST /api/trees returns 403 for USER and 201 for ADMIN", async () => {
    const { POST } = await import("@/app/api/trees/route");

    mockGetCurrentUser.mockResolvedValueOnce({
      id: "user-1",
      email: "user@test.com",
      name: "유저",
      role: "USER",
    });
    const denied = await POST(
      new Request("http://localhost/api/trees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "새 가계도" }),
      })
    );
    expect(denied.status).toBe(403);

    mockGetCurrentUser.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@test.com",
      name: "관리자",
      role: "ADMIN",
    });
    mockPrisma.familyTree.create.mockResolvedValueOnce({
      id: "t-new",
      title: "새 가계도",
    });
    const allowed = await POST(
      new Request("http://localhost/api/trees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "새 가계도" }),
      })
    );
    expect(allowed.status).toBe(201);
    expect(mockPrisma.familyTree.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          members: { create: { userId: "admin-1", role: "OWNER" } },
        }),
      })
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSessionUser = vi.fn();
const mockPrisma = {
  familyTree: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  person: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  },
  marriage: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock("@/lib/auth", () => ({
  getSessionUser: () => mockGetSessionUser(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

describe("Trees & Share API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when non-owner calls PUT /api/trees/[treeId]/graph", async () => {
    mockGetSessionUser.mockResolvedValue({ userId: "user-b", email: "b@test.com" });
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-1",
      ownerId: "user-a",
    });

    const { PUT } = await import("@/app/api/trees/[treeId]/graph/route");
    const req = new Request("http://localhost/api/trees/tree-1/graph", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: [] }),
    });
    const res = await PUT(req, { params: Promise.resolve({ treeId: "tree-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 when PUT /api/trees/[treeId]/graph submits a circular parent reference", async () => {
    mockGetSessionUser.mockResolvedValue({ userId: "user-a", email: "a@test.com" });
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-1",
      ownerId: "user-a",
    });

    const { PUT } = await import("@/app/api/trees/[treeId]/graph/route");
    const req = new Request("http://localhost/api/trees/tree-1/graph", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodes: [
          {
            id: "p1",
            data: { nameKo: "홍일", gender: "M", actualGender: "MALE" },
            rels: { parents: ["p2"], children: ["p2"], spouses: [] },
          },
          {
            id: "p2",
            data: { nameKo: "홍이", gender: "M", actualGender: "MALE" },
            rels: { parents: ["p1"], children: ["p1"], spouses: [] },
          },
        ],
      }),
    });

    const res = await PUT(req, { params: Promise.resolve({ treeId: "tree-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when GET /api/share/[token] is called for a tree with isShared=false", async () => {
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-1",
      title: "김해 김씨",
      isShared: false,
      shareToken: "tok-1",
      persons: [],
      marriages: [],
    });

    const { GET } = await import("@/app/api/share/[token]/route");
    const res = await GET(new Request("http://localhost/api/share/tok-1"), {
      params: Promise.resolve({ token: "tok-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 without ownerId when GET /api/share/[token] has isShared=true", async () => {
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-1",
      title: "김해 김씨 가계도",
      ownerId: "secret-owner-id",
      bonKo: "김해",
      bonHanja: "金海",
      surnameKo: "김",
      surnameHanja: "金",
      childOrderMode: "BY_ORDER",
      rootPersonId: null,
      shareToken: "tok-1",
      isShared: true,
      persons: [],
      marriages: [],
    });

    const { GET } = await import("@/app/api/share/[token]/route");
    const res = await GET(new Request("http://localhost/api/share/tok-1"), {
      params: Promise.resolve({ token: "tok-1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tree.title).toBe("김해 김씨 가계도");
    expect(json.tree.ownerId).toBeUndefined();
  });
});

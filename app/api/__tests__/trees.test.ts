import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockPrisma = {
  familyTree: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  treeMember: {
    findUnique: vi.fn(),
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
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

describe("Trees & Share API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when non-owner calls PUT /api/trees/[treeId]/graph", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-b", email: "b@test.com", name: "B", role: "USER" });
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-1",
      ownerId: "user-a",
    });
    mockPrisma.treeMember.findUnique.mockResolvedValue(null);

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
    mockGetCurrentUser.mockResolvedValue({ id: "user-a", email: "a@test.com", name: "A", role: "USER" });
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-1",
      ownerId: "user-a",
    });
    mockPrisma.treeMember.findUnique.mockResolvedValue({ role: "OWNER" });

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

  it("returns 404 when DELETE /persons/[personId] targets a person in another tree (IDOR guard)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-b", email: "b@test.com", name: "B", role: "USER" });
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-b",
      ownerId: "user-b",
    });
    mockPrisma.treeMember.findUnique.mockResolvedValue({ role: "OWNER" });
    mockPrisma.person.findUnique.mockResolvedValue({
      id: "victim-person",
      treeId: "tree-a",
    });

    const { DELETE } = await import(
      "@/app/api/trees/[treeId]/persons/[personId]/route"
    );
    const res = await DELETE(
      new Request("http://localhost/api/trees/tree-b/persons/victim-person", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ treeId: "tree-b", personId: "victim-person" }) }
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.person.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when DELETE /marriages/[marriageId] targets a marriage in another tree (IDOR guard)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-b", email: "b@test.com", name: "B", role: "USER" });
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-b",
      ownerId: "user-b",
    });
    mockPrisma.treeMember.findUnique.mockResolvedValue({ role: "OWNER" });
    mockPrisma.marriage.findUnique.mockResolvedValue({
      id: "victim-marriage",
      treeId: "tree-a",
    });

    const { DELETE } = await import(
      "@/app/api/trees/[treeId]/marriages/[marriageId]/route"
    );
    const res = await DELETE(
      new Request("http://localhost/api/trees/tree-b/marriages/victim-marriage", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({
          treeId: "tree-b",
          marriageId: "victim-marriage",
        }),
      }
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.marriage.delete).not.toHaveBeenCalled();
  });

  it("returns 403 when PUT /graph attempts to overwrite a person belonging to another tree", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-b", email: "b@test.com", name: "B", role: "USER" });
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-b",
      ownerId: "user-b",
    });
    mockPrisma.treeMember.findUnique.mockResolvedValue({ role: "OWNER" });
    mockPrisma.person.findMany.mockResolvedValue([{ id: "victim-p1" }]);

    const { PUT } = await import("@/app/api/trees/[treeId]/graph/route");
    const res = await PUT(
      new Request("http://localhost/api/trees/tree-b/graph", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes: [
            {
              id: "victim-p1",
              data: { nameKo: "탈취", gender: "M" },
              rels: { parents: [], children: [], spouses: [] },
            },
          ],
        }),
      }),
      { params: Promise.resolve({ treeId: "tree-b" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when PUT /graph references a dangling parent ID not in submitted nodes", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-a", email: "a@test.com", name: "A", role: "USER" });
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-1",
      ownerId: "user-a",
    });
    mockPrisma.treeMember.findUnique.mockResolvedValue({ role: "OWNER" });
    mockPrisma.person.findMany.mockResolvedValue([]);

    const { PUT } = await import("@/app/api/trees/[treeId]/graph/route");
    const res = await PUT(
      new Request("http://localhost/api/trees/tree-1/graph", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes: [
            {
              id: "p1",
              data: { nameKo: "홍길동", gender: "M" },
              rels: { parents: ["other-tree-parent"], children: [], spouses: [] },
            },
          ],
        }),
      }),
      { params: Promise.resolve({ treeId: "tree-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("allows VIEWER to GET /api/trees/[treeId] with myRole, omits shareToken/ownerId, blocks VIEWER on PATCH and DELETE", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "viewer-1", email: "v@test.com", name: "열람", role: "USER" });
    mockPrisma.familyTree.findUnique.mockResolvedValue({
      id: "tree-1",
      title: "김해 김씨",
      ownerId: "owner-1",
      shareToken: "secret-share-token",
      persons: [],
      marriages: [],
    });
    mockPrisma.treeMember.findUnique.mockResolvedValue({ role: "VIEWER" });

    const { GET, PATCH, DELETE } = await import("@/app/api/trees/[treeId]/route");
    const getRes = await GET(new Request("http://localhost/api/trees/tree-1"), {
      params: Promise.resolve({ treeId: "tree-1" }),
    });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.myRole).toBe("VIEWER");
    expect(getJson.tree.shareToken).toBeUndefined();
    expect(getJson.tree.ownerId).toBeUndefined();

    const patchRes = await PATCH(
      new Request("http://localhost/api/trees/tree-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "수정" }),
      }),
      { params: Promise.resolve({ treeId: "tree-1" }) }
    );
    expect(patchRes.status).toBe(403);

    const delRes = await DELETE(
      new Request("http://localhost/api/trees/tree-1", { method: "DELETE" }),
      { params: Promise.resolve({ treeId: "tree-1" }) }
    );
    expect(delRes.status).toBe(403);
  });

  it("allows EDITOR to PATCH title, blocks EDITOR on isShared and DELETE, allows OWNER on isShared", async () => {
    const { PATCH, DELETE } = await import("@/app/api/trees/[treeId]/route");

    mockGetCurrentUser.mockResolvedValue({ id: "editor-1", email: "e@test.com", name: "편집", role: "USER" });
    mockPrisma.familyTree.findUnique.mockResolvedValue({ id: "tree-1", ownerId: "owner-1" });
    mockPrisma.treeMember.findUnique.mockResolvedValue({ role: "EDITOR" });
    mockPrisma.familyTree.update.mockResolvedValue({ id: "tree-1", title: "수정됨" });

    const titleRes = await PATCH(
      new Request("http://localhost/api/trees/tree-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "수정됨" }),
      }),
      { params: Promise.resolve({ treeId: "tree-1" }) }
    );
    expect(titleRes.status).toBe(200);

    const shareDenied = await PATCH(
      new Request("http://localhost/api/trees/tree-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "같이", isShared: true }),
      }),
      { params: Promise.resolve({ treeId: "tree-1" }) }
    );
    expect(shareDenied.status).toBe(403);

    const delDenied = await DELETE(
      new Request("http://localhost/api/trees/tree-1", { method: "DELETE" }),
      { params: Promise.resolve({ treeId: "tree-1" }) }
    );
    expect(delDenied.status).toBe(403);

    mockGetCurrentUser.mockResolvedValue({ id: "owner-1", email: "o@test.com", name: "소유", role: "USER" });
    mockPrisma.treeMember.findUnique.mockResolvedValue({ role: "OWNER" });
    mockPrisma.familyTree.update.mockResolvedValue({ id: "tree-1", isShared: true });

    const shareOk = await PATCH(
      new Request("http://localhost/api/trees/tree-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isShared: true }),
      }),
      { params: Promise.resolve({ treeId: "tree-1" }) }
    );
    expect(shareOk.status).toBe(200);
  });
});

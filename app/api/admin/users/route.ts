import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/tree-auth";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const unassignedOnly = searchParams.get("unassigned") === "true";

  const rawUsers = await prisma.user.findMany({
    where: unassignedOnly ? { memberships: { none: {} } } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      memberships: {
        select: {
          role: true,
          tree: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
  });

  const users = rawUsers.map(({ memberships, ...user }) => ({
    ...user,
    memberships: memberships.map((m) => ({
      treeId: m.tree.id,
      treeTitle: m.tree.title,
      role: m.role,
    })),
  }));

  return NextResponse.json({ users });
}

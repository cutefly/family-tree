import { NextResponse } from "next/server";
import type { TreeRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type EffectiveTreeRole = "ADMIN" | TreeRole;

const ROLE_RANK: Record<TreeRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }

  if (user.role !== "ADMIN") {
    return {
      error: NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 }
      ),
    };
  }

  return { user };
}

export async function requireTreeAccess(
  treeId: string,
  minRole: TreeRole = "VIEWER"
) {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }

  const tree = await prisma.familyTree.findUnique({ where: { id: treeId } });
  if (!tree) {
    return {
      error: NextResponse.json(
        { error: "가계도를 찾을 수 없습니다." },
        { status: 404 }
      ),
    };
  }

  if (user.role === "ADMIN") {
    return { user, tree, role: "ADMIN" as EffectiveTreeRole };
  }

  const member = await prisma.treeMember.findUnique({
    where: { treeId_userId: { treeId, userId: user.id } },
    select: { role: true },
  });

  if (!member || ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
    return {
      error: NextResponse.json({ error: "권한이 없습니다." }, { status: 403 }),
    };
  }

  return { user, tree, role: member.role as EffectiveTreeRole };
}

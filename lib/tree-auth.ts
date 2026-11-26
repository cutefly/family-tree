import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireOwnedTree(treeId: string) {
  const session = await getSessionUser();
  if (!session) {
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

  if (tree.ownerId !== session.userId) {
    return {
      error: NextResponse.json({ error: "권한이 없습니다." }, { status: 403 }),
    };
  }

  return { session, tree };
}

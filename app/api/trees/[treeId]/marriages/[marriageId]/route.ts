import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedTree } from "@/lib/tree-auth";

type Params = { params: Promise<{ treeId: string; marriageId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { treeId, marriageId } = await params;
  const auth = await requireOwnedTree(treeId);
  if (auth.error) return auth.error;

  const target = await prisma.marriage.findUnique({ where: { id: marriageId } });
  if (!target || target.treeId !== treeId) {
    return NextResponse.json(
      { error: "배우자 관계를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  await prisma.marriage.delete({ where: { id: marriageId } });
  return NextResponse.json({ ok: true });
}

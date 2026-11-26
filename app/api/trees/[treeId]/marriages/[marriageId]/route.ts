import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedTree } from "@/lib/tree-auth";

type Params = { params: Promise<{ treeId: string; marriageId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { treeId, marriageId } = await params;
  const auth = await requireOwnedTree(treeId);
  if (auth.error) return auth.error;

  await prisma.marriage.delete({ where: { id: marriageId } });
  return NextResponse.json({ ok: true });
}

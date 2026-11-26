import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedTree } from "@/lib/tree-auth";

type Params = { params: Promise<{ treeId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { treeId } = await params;
  const auth = await requireOwnedTree(treeId);
  if (auth.error) return auth.error;

  const tree = await prisma.familyTree.findUnique({
    where: { id: treeId },
    include: {
      persons: { orderBy: { createdAt: "asc" } },
      marriages: true,
    },
  });

  return NextResponse.json({ tree });
}

export async function PATCH(request: Request, { params }: Params) {
  const { treeId } = await params;
  const auth = await requireOwnedTree(treeId);
  if (auth.error) return auth.error;

  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }
  for (const field of ["bonKo", "bonHanja", "surnameKo", "surnameHanja"] as const) {
    if (field in body) {
      data[field] =
        typeof body[field] === "string" ? body[field].trim() || null : null;
    }
  }
  if (
    body.childOrderMode === "BY_ORDER" ||
    body.childOrderMode === "BY_GENDER_THEN_ORDER"
  ) {
    data.childOrderMode = body.childOrderMode;
  }
  if ("rootPersonId" in body) {
    if (typeof body.rootPersonId === "string" && body.rootPersonId) {
      const target = await prisma.person.findUnique({
        where: { id: body.rootPersonId },
        select: { treeId: true },
      });
      if (!target || target.treeId !== treeId) {
        return NextResponse.json(
          { error: "중심 인물이 현재 가계도에 존재하지 않습니다." },
          { status: 400 }
        );
      }
      data.rootPersonId = body.rootPersonId;
    } else {
      data.rootPersonId = null;
    }
  }
  if (typeof body.isShared === "boolean") {
    data.isShared = body.isShared;
  }
  if (body.regenerateShareToken === true) {
    data.shareToken = crypto.randomUUID();
  }

  const tree = await prisma.familyTree.update({
    where: { id: treeId },
    data,
  });

  return NextResponse.json({ tree });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { treeId } = await params;
  const auth = await requireOwnedTree(treeId);
  if (auth.error) return auth.error;

  await prisma.familyTree.delete({ where: { id: treeId } });
  return NextResponse.json({ ok: true });
}

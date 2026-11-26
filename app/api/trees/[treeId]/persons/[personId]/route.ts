import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTreeAccess } from "@/lib/tree-auth";
import {
  ValidationError,
  validateParentLinks,
  validatePersonName,
} from "@/lib/validation";

type Params = { params: Promise<{ treeId: string; personId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { treeId, personId } = await params;
  const auth = await requireTreeAccess(treeId, "EDITOR");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const existing = await prisma.person.findMany({
      where: { treeId },
      select: { id: true, fatherId: true, motherId: true, nameKo: true, surnameKo: true },
    });

    const target = existing.find((p) => p.id === personId);
    if (!target) {
      return NextResponse.json(
        { error: "인물을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const nextNameKo = "nameKo" in body ? body.nameKo : target.nameKo;
    const nextSurnameKo = "surnameKo" in body ? body.surnameKo : target.surnameKo;
    validatePersonName({ nameKo: nextNameKo, surnameKo: nextSurnameKo });

    const nextFatherId = "fatherId" in body ? body.fatherId : target.fatherId;
    const nextMotherId = "motherId" in body ? body.motherId : target.motherId;
    const treeIds = new Set(existing.map((p) => p.id));
    if (
      (nextFatherId && !treeIds.has(nextFatherId)) ||
      (nextMotherId && !treeIds.has(nextMotherId))
    ) {
      throw new ValidationError("부모 인물이 현재 가계도에 존재하지 않습니다.");
    }

    validateParentLinks(
      existing.map((p) =>
        p.id === personId
          ? { id: p.id, fatherId: nextFatherId, motherId: nextMotherId }
          : p
      )
    );

    const data: Record<string, unknown> = {};
    for (const field of [
      "nameKo",
      "nameHanja",
      "surnameKo",
      "surnameHanja",
      "bonKo",
      "bonHanja",
      "birthDate",
      "deathDate",
      "memo",
    ] as const) {
      if (field in body) {
        data[field] =
          typeof body[field] === "string" ? body[field].trim() || null : null;
      }
    }
    if (
      body.gender === "MALE" ||
      body.gender === "FEMALE" ||
      body.gender === "OTHER"
    ) {
      data.gender = body.gender;
    }
    if ("birthOrder" in body) {
      data.birthOrder =
        typeof body.birthOrder === "number" ? body.birthOrder : null;
    }
    if ("fatherId" in body) data.fatherId = nextFatherId;
    if ("motherId" in body) data.motherId = nextMotherId;

    const person = await prisma.person.update({
      where: { id: personId },
      data,
    });

    return NextResponse.json({ person });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "인물 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { treeId, personId } = await params;
  const auth = await requireTreeAccess(treeId, "EDITOR");
  if ("error" in auth) return auth.error;

  const target = await prisma.person.findUnique({ where: { id: personId } });
  if (!target || target.treeId !== treeId) {
    return NextResponse.json(
      { error: "인물을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.person.delete({ where: { id: personId } });
    if (auth.tree.rootPersonId === personId) {
      await tx.familyTree.update({
        where: { id: treeId },
        data: { rootPersonId: null },
      });
    }
  });

  return NextResponse.json({ ok: true });
}

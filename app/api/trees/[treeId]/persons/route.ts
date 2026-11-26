import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedTree } from "@/lib/tree-auth";
import {
  ValidationError,
  validateParentLinks,
  validatePersonName,
} from "@/lib/validation";

type Params = { params: Promise<{ treeId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { treeId } = await params;
  const auth = await requireOwnedTree(treeId);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    validatePersonName(body);

    const existing = await prisma.person.findMany({
      where: { treeId },
      select: { id: true, fatherId: true, motherId: true },
    });

    const newId = crypto.randomUUID();
    const fatherId = typeof body.fatherId === "string" ? body.fatherId : null;
    const motherId = typeof body.motherId === "string" ? body.motherId : null;

    const treeIds = new Set(existing.map((p) => p.id));
    if (
      (fatherId && !treeIds.has(fatherId)) ||
      (motherId && !treeIds.has(motherId))
    ) {
      throw new ValidationError("부모 인물이 현재 가계도에 존재하지 않습니다.");
    }

    validateParentLinks([...existing, { id: newId, fatherId, motherId }]);

    const person = await prisma.person.create({
      data: {
        id: newId,
        treeId,
        nameKo: typeof body.nameKo === "string" ? body.nameKo.trim() || null : null,
        nameHanja:
          typeof body.nameHanja === "string" ? body.nameHanja.trim() || null : null,
        surnameKo:
          typeof body.surnameKo === "string" ? body.surnameKo.trim() || null : null,
        surnameHanja:
          typeof body.surnameHanja === "string"
            ? body.surnameHanja.trim() || null
            : null,
        bonKo: typeof body.bonKo === "string" ? body.bonKo.trim() || null : null,
        bonHanja:
          typeof body.bonHanja === "string" ? body.bonHanja.trim() || null : null,
        gender:
          body.gender === "FEMALE" || body.gender === "OTHER"
            ? body.gender
            : "MALE",
        birthDate:
          typeof body.birthDate === "string" ? body.birthDate.trim() || null : null,
        deathDate:
          typeof body.deathDate === "string" ? body.deathDate.trim() || null : null,
        birthOrder:
          typeof body.birthOrder === "number" ? body.birthOrder : null,
        memo: typeof body.memo === "string" ? body.memo.trim() || null : null,
        fatherId,
        motherId,
      },
    });

    return NextResponse.json({ person }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "인물 추가 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

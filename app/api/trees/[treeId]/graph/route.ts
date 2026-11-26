import { NextResponse } from "next/server";
import { fromFamilyChartData, type FamilyChartDatum } from "@/lib/family-graph";
import { prisma } from "@/lib/prisma";
import { requireOwnedTree } from "@/lib/tree-auth";
import {
  ValidationError,
  normalizeSpousePair,
  validateParentLinks,
  validatePersonName,
} from "@/lib/validation";

type Params = { params: Promise<{ treeId: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { treeId } = await params;
  const auth = await requireOwnedTree(treeId);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const nodes: FamilyChartDatum[] = Array.isArray(body.nodes) ? body.nodes : [];
    const { persons, marriages } = fromFamilyChartData(nodes);

    for (const p of persons) {
      validatePersonName(p);
    }
    validateParentLinks(persons);

    const normalizedMarriages = marriages.map((m) => {
      const [person1Id, person2Id] = normalizeSpousePair(m.person1Id, m.person2Id);
      return { treeId, person1Id, person2Id };
    });

    const keepIds = persons.map((p) => p.id);

    await prisma.$transaction(async (tx) => {
      await tx.marriage.deleteMany({ where: { treeId } });

      await tx.person.deleteMany({
        where: {
          treeId,
          ...(keepIds.length > 0 ? { id: { notIn: keepIds } } : {}),
        },
      });

      // Upsert persons with null parent FKs first so new nodes exist before linking
      for (const p of persons) {
        await tx.person.upsert({
          where: { id: p.id },
          create: {
            id: p.id,
            treeId,
            nameKo: p.nameKo,
            nameHanja: p.nameHanja,
            surnameKo: p.surnameKo,
            surnameHanja: p.surnameHanja,
            bonKo: p.bonKo,
            bonHanja: p.bonHanja,
            gender: p.gender,
            birthDate: p.birthDate,
            deathDate: p.deathDate,
            birthOrder: p.birthOrder,
            memo: p.memo,
          },
          update: {
            nameKo: p.nameKo,
            nameHanja: p.nameHanja,
            surnameKo: p.surnameKo,
            surnameHanja: p.surnameHanja,
            bonKo: p.bonKo,
            bonHanja: p.bonHanja,
            gender: p.gender,
            birthDate: p.birthDate,
            deathDate: p.deathDate,
            birthOrder: p.birthOrder,
            memo: p.memo,
          },
        });
      }

      for (const p of persons) {
        await tx.person.update({
          where: { id: p.id },
          data: {
            fatherId: p.fatherId,
            motherId: p.motherId,
          },
        });
      }

      if (normalizedMarriages.length > 0) {
        await tx.marriage.createMany({
          data: normalizedMarriages,
          skipDuplicates: true,
        });
      }
    });

    const updated = await prisma.familyTree.findUnique({
      where: { id: treeId },
      include: {
        persons: { orderBy: { createdAt: "asc" } },
        marriages: true,
      },
    });

    return NextResponse.json({ tree: updated });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "가계도 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

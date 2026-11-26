import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTreeAccess } from "@/lib/tree-auth";
import { ValidationError, normalizeSpousePair } from "@/lib/validation";

type Params = { params: Promise<{ treeId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { treeId } = await params;
  const auth = await requireTreeAccess(treeId, "EDITOR");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const [person1Id, person2Id] = normalizeSpousePair(
      String(body.person1Id ?? ""),
      String(body.person2Id ?? "")
    );

    const members = await prisma.person.findMany({
      where: { treeId, id: { in: [person1Id, person2Id] } },
      select: { id: true },
    });
    if (members.length !== 2) {
      throw new ValidationError("배우자 인물이 현재 가계도에 존재하지 않습니다.");
    }

    const existing = await prisma.marriage.findFirst({
      where: { treeId, person1Id, person2Id },
    });
    if (existing) {
      return NextResponse.json(
        { error: "이미 등록된 배우자 관계입니다." },
        { status: 409 }
      );
    }

    const marriage = await prisma.marriage.create({
      data: { treeId, person1Id, person2Id },
    });

    return NextResponse.json({ marriage }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "배우자 연결 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

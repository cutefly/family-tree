import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedTree } from "@/lib/tree-auth";
import { ValidationError, normalizeSpousePair } from "@/lib/validation";

type Params = { params: Promise<{ treeId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { treeId } = await params;
  const auth = await requireOwnedTree(treeId);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const [person1Id, person2Id] = normalizeSpousePair(
      String(body.person1Id ?? ""),
      String(body.person2Id ?? "")
    );

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

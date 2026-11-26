import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const tree = await prisma.familyTree.findUnique({
    where: { shareToken: token },
    include: {
      persons: { orderBy: { createdAt: "asc" } },
      marriages: true,
    },
  });

  if (!tree || !tree.isShared) {
    return NextResponse.json(
      { error: "공유된 가계도를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    tree: {
      id: tree.id,
      title: tree.title,
      bonKo: tree.bonKo,
      bonHanja: tree.bonHanja,
      surnameKo: tree.surnameKo,
      surnameHanja: tree.surnameHanja,
      childOrderMode: tree.childOrderMode,
      rootPersonId: tree.rootPersonId,
      persons: tree.persons,
      marriages: tree.marriages,
    },
  });
}

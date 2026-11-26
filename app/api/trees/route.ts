import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const trees = await prisma.familyTree.findMany({
    where: { ownerId: session.userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { persons: true } } },
  });

  return NextResponse.json({ trees });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json(
      { error: "가계도 이름을 입력해 주세요." },
      { status: 400 }
    );
  }

  const tree = await prisma.familyTree.create({
    data: {
      title,
      ownerId: session.userId,
      bonKo: typeof body.bonKo === "string" ? body.bonKo.trim() || null : null,
      bonHanja:
        typeof body.bonHanja === "string" ? body.bonHanja.trim() || null : null,
      surnameKo:
        typeof body.surnameKo === "string" ? body.surnameKo.trim() || null : null,
      surnameHanja:
        typeof body.surnameHanja === "string"
          ? body.surnameHanja.trim() || null
          : null,
      childOrderMode:
        body.childOrderMode === "BY_GENDER_THEN_ORDER"
          ? "BY_GENDER_THEN_ORDER"
          : "BY_ORDER",
      shareToken: crypto.randomUUID(),
    },
  });

  return NextResponse.json({ tree }, { status: 201 });
}

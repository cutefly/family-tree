import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/tree-auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (user.role === "ADMIN") {
    const rawTrees = await prisma.familyTree.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { persons: true, members: true } } },
    });
    const trees = rawTrees.map((tree) => ({
      ...tree,
      myRole: "ADMIN" as const,
    }));
    return NextResponse.json({ trees });
  }

  const rawTrees = await prisma.familyTree.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { persons: true, members: true } },
      members: {
        where: { userId: user.id },
        select: { role: true },
      },
    },
  });

  const trees = rawTrees.map(({ members, ...tree }) => ({
    ...tree,
    myRole: members[0]?.role ?? ("VIEWER" as const),
  }));

  return NextResponse.json({ trees });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

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
      ownerId: auth.user.id,
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
      members: {
        create: {
          userId: auth.user.id,
          role: "OWNER",
        },
      },
    },
  });

  return NextResponse.json({ tree }, { status: 201 });
}

import { NextResponse } from "next/server";
import type { TreeRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTreeAccess } from "@/lib/tree-auth";

type Params = { params: Promise<{ treeId: string; userId: string }> };

const VALID_ROLES: TreeRole[] = ["OWNER", "EDITOR", "VIEWER"];

async function isLastOwner(treeId: string, targetRole: TreeRole): Promise<boolean> {
  if (targetRole !== "OWNER") return false;
  const ownerCount = await prisma.treeMember.count({
    where: { treeId, role: "OWNER" },
  });
  return ownerCount <= 1;
}

export async function PATCH(request: Request, { params }: Params) {
  const { treeId, userId } = await params;
  const auth = await requireTreeAccess(treeId, "OWNER");
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const nextRole = body.role as TreeRole;
  if (!VALID_ROLES.includes(nextRole)) {
    return NextResponse.json(
      { error: "유효한 역할을 선택해 주세요." },
      { status: 400 }
    );
  }

  const existing = await prisma.treeMember.findUnique({
    where: { treeId_userId: { treeId, userId } },
    select: { role: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "가계도 멤버를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  if (
    (existing.role === "OWNER" || nextRole === "OWNER") &&
    auth.role !== "ADMIN"
  ) {
    return NextResponse.json(
      { error: "소유자(OWNER) 권한 변경은 관리자만 가능합니다." },
      { status: 403 }
    );
  }

  if (nextRole !== "OWNER" && (await isLastOwner(treeId, existing.role))) {
    return NextResponse.json(
      { error: "가계도의 마지막 소유자는 강등할 수 없습니다." },
      { status: 400 }
    );
  }

  const updated = await prisma.treeMember.update({
    where: { treeId_userId: { treeId, userId } },
    data: { role: nextRole },
    select: {
      role: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({
    member: {
      userId: updated.user.id,
      email: updated.user.email,
      name: updated.user.name,
      role: updated.role,
      createdAt: updated.createdAt,
    },
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { treeId, userId } = await params;
  const auth = await requireTreeAccess(treeId, "OWNER");
  if ("error" in auth) return auth.error;

  const existing = await prisma.treeMember.findUnique({
    where: { treeId_userId: { treeId, userId } },
    select: { role: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "가계도 멤버를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  if (existing.role === "OWNER" && auth.role !== "ADMIN") {
    return NextResponse.json(
      { error: "소유자(OWNER) 제거는 관리자만 가능합니다." },
      { status: 403 }
    );
  }

  if (await isLastOwner(treeId, existing.role)) {
    return NextResponse.json(
      { error: "가계도의 마지막 소유자는 제거할 수 없습니다." },
      { status: 400 }
    );
  }

  await prisma.treeMember.delete({
    where: { treeId_userId: { treeId, userId } },
  });

  return NextResponse.json({ ok: true });
}

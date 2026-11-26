import { NextResponse } from "next/server";
import type { TreeRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTreeAccess } from "@/lib/tree-auth";

type Params = { params: Promise<{ treeId: string }> };

const VALID_ROLES: TreeRole[] = ["OWNER", "EDITOR", "VIEWER"];

export async function GET(_request: Request, { params }: Params) {
  const { treeId } = await params;
  const auth = await requireTreeAccess(treeId, "OWNER");
  if ("error" in auth) return auth.error;

  const rows = await prisma.treeMember.findMany({
    where: { treeId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  const members = rows.map((row) => ({
    userId: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.role,
    createdAt: row.createdAt,
  }));

  return NextResponse.json({ members });
}

export async function POST(request: Request, { params }: Params) {
  const { treeId } = await params;
  const auth = await requireTreeAccess(treeId, "OWNER");
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role as TreeRole;

  if (!email || !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: "유효한 이메일과 역할을 입력해 주세요." },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });

  if (!targetUser) {
    return NextResponse.json(
      { error: "가입된 사용자를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  if (role === "OWNER" && auth.role !== "ADMIN") {
    return NextResponse.json(
      { error: "소유자(OWNER) 권한 부여는 관리자만 가능합니다." },
      { status: 403 }
    );
  }

  const existingMember = await prisma.treeMember.findUnique({
    where: { treeId_userId: { treeId, userId: targetUser.id } },
    select: { role: true },
  });

  if (existingMember?.role === "OWNER" && auth.role !== "ADMIN") {
    return NextResponse.json(
      { error: "기존 소유자의 권한은 관리자만 변경할 수 있습니다." },
      { status: 403 }
    );
  }

  if (existingMember?.role === "OWNER" && role !== "OWNER") {
    const ownerCount = await prisma.treeMember.count({
      where: { treeId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "가계도의 마지막 소유자는 강등할 수 없습니다." },
        { status: 400 }
      );
    }
  }

  const member = await prisma.treeMember.upsert({
    where: { treeId_userId: { treeId, userId: targetUser.id } },
    create: { treeId, userId: targetUser.id, role },
    update: { role },
    select: {
      role: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json(
    {
      member: {
        userId: member.user.id,
        email: member.user.email,
        name: member.user.name,
        role: member.role,
        createdAt: member.createdAt,
      },
    },
    { status: 201 }
  );
}

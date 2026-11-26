import { PrismaClient, UserRole } from "@prisma/client";

try {
  process.loadEnvFile?.();
} catch {
  // .env가 없으면 기존 환경변수를 사용합니다.
}

const prisma = new PrismaClient();

async function main() {
  const rawEmail = process.argv[2];
  const email = rawEmail?.trim().toLowerCase();

  if (!email) {
    console.error("사용법: npx tsx prisma/promote-admin.ts <user-email>");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!existing) {
    console.error(`가입된 사용자를 찾을 수 없습니다: ${email}`);
    process.exit(1);
  }

  if (existing.role === UserRole.ADMIN) {
    console.log(`이미 ADMIN 권한을 가진 사용자입니다: ${existing.email}`);
    return;
  }

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: { role: UserRole.ADMIN },
    select: { email: true, name: true, role: true },
  });

  console.log(`ADMIN 승격 완료: ${updated.name} (${updated.email})`);
}

main()
  .catch((err) => {
    console.error("ADMIN 승격 중 오류가 발생했습니다:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient, TreeRole } from "@prisma/client";

try {
  process.loadEnvFile?.();
} catch {
  // .env가 없으면 기존 환경변수를 사용합니다.
}

const prisma = new PrismaClient();

async function main() {
  const trees = await prisma.familyTree.findMany({
    select: { id: true, ownerId: true },
  });

  if (trees.length === 0) {
    console.log("백필할 기존 가계도가 없습니다.");
    return;
  }

  const result = await prisma.treeMember.createMany({
    data: trees.map((tree) => ({
      treeId: tree.id,
      userId: tree.ownerId,
      role: TreeRole.OWNER,
    })),
    skipDuplicates: true,
  });

  console.log(
    `기존 가계도 ${trees.length}건 중 ${result.count}건의 소유자(OWNER) 멤버십을 백필했습니다.`
  );
}

main()
  .catch((err) => {
    console.error("백필 중 오류가 발생했습니다:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

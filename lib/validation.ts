export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Ensure a person has at least a Korean given name (`nameKo`) or a surname (`surnameKo`).
 */
export function validatePersonName(input: {
  nameKo?: string | null;
  surnameKo?: string | null;
}): void {
  if (!hasText(input.nameKo) && !hasText(input.surnameKo)) {
    throw new ValidationError("한글 이름 또는 성씨 중 최소 하나는 입력해야 합니다.");
  }
}

/**
 * Normalize a spouse pair so `person1Id < person2Id` and prevent self-marriage.
 */
export function normalizeSpousePair(id1: string, id2: string): [string, string] {
  if (id1 === id2) {
    throw new ValidationError("자기 자신을 배우자로 지정할 수 없습니다.");
  }
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

/**
 * Validate parent links for self-parenting, duplicate parent IDs, and multi-generation cycles.
 */
export function validateParentLinks(
  persons: Array<{ id: string; fatherId: string | null; motherId: string | null }>
): void {
  const byId = new Map<string, { fatherId: string | null; motherId: string | null }>();
  for (const person of persons) {
    if (person.fatherId === person.id || person.motherId === person.id) {
      throw new ValidationError("자기 자신을 부모로 지정할 수 없습니다.");
    }
    if (person.fatherId && person.motherId && person.fatherId === person.motherId) {
      throw new ValidationError("부와 모에 동일한 인물을 지정할 수 없습니다.");
    }
    byId.set(person.id, { fatherId: person.fatherId, motherId: person.motherId });
  }

  // 0 = unvisited, 1 = visiting (on current recursion stack), 2 = visited
  const state = new Map<string, number>();

  function dfs(id: string): void {
    const current = state.get(id) ?? 0;
    if (current === 1) {
      throw new ValidationError("부모 관계에 순환 참조가 존재합니다.");
    }
    if (current === 2) return;

    state.set(id, 1);
    const node = byId.get(id);
    if (node) {
      if (node.fatherId && byId.has(node.fatherId)) dfs(node.fatherId);
      if (node.motherId && byId.has(node.motherId)) dfs(node.motherId);
    }
    state.set(id, 2);
  }

  for (const person of persons) {
    if ((state.get(person.id) ?? 0) === 0) {
      dfs(person.id);
    }
  }
}

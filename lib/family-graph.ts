import type { ChildOrderMode, Gender, Marriage, Person } from "@prisma/client";

export interface FamilyChartPersonData {
  displayName: string;
  hanjaName: string;
  nameKo: string;
  nameHanja: string;
  surnameKo: string;
  surnameHanja: string;
  bonKo: string;
  bonHanja: string;
  gender: "M" | "F";
  actualGender: Gender;
  birthDate: string;
  deathDate: string;
  birthOrder: string;
  memo: string;
  motherId?: string;
}

export interface FamilyChartDatum {
  id: string;
  unknown?: boolean;
  to_add?: boolean;
  data: FamilyChartPersonData;
  rels: {
    parents: string[];
    children: string[];
    spouses: string[];
  };
}

export interface SyncPersonInput {
  id: string;
  nameKo: string | null;
  nameHanja: string | null;
  surnameKo: string | null;
  surnameHanja: string | null;
  bonKo: string | null;
  bonHanja: string | null;
  gender: Gender;
  birthDate: string | null;
  deathDate: string | null;
  birthOrder: number | null;
  memo: string | null;
  fatherId: string | null;
  motherId: string | null;
}

const GENDER_RANK: Record<Gender, number> = {
  MALE: 0,
  FEMALE: 1,
  OTHER: 2,
};

function cleanStr(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Format a person's primary and secondary (Hanja) display names.
 * Handles spouses who only have clan origin (`bonKo`) and `surnameKo` without a given name.
 */
export function formatPersonDisplayName(
  person: Pick<Person, "nameKo" | "nameHanja" | "surnameKo" | "bonKo">
): { primary: string; secondary: string | null } {
  const nameKo = cleanStr(person.nameKo);
  const nameHanja = cleanStr(person.nameHanja);
  const surnameKo = cleanStr(person.surnameKo);
  const bonKo = cleanStr(person.bonKo);

  if (nameKo) {
    return { primary: nameKo, secondary: nameHanja };
  }

  if (surnameKo) {
    const prefix = bonKo ? `${bonKo} ` : "";
    return { primary: `${prefix}${surnameKo}씨`, secondary: null };
  }

  return { primary: "이름 미상", secondary: null };
}

/**
 * Sort children according to the tree's `ChildOrderMode`.
 * Null `birthOrder` values always sort after numbered siblings.
 */
export function sortChildren<
  T extends Pick<Person, "gender" | "birthOrder" | "createdAt">
>(children: T[], mode: ChildOrderMode): T[] {
  return [...children].sort((a, b) => {
    if (mode === "BY_GENDER_THEN_ORDER") {
      const genderDiff = GENDER_RANK[a.gender] - GENDER_RANK[b.gender];
      if (genderDiff !== 0) return genderDiff;
    }

    const orderA = a.birthOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.birthOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

/**
 * Convert normalized DB `Person[]` and `Marriage[]` into `family-chart` v2 nodes.
 */
export function toFamilyChartData(
  persons: Person[],
  marriages: Marriage[],
  childOrderMode: ChildOrderMode
): FamilyChartDatum[] {
  const childrenByParent = new Map<string, Person[]>();
  for (const person of persons) {
    if (person.fatherId) {
      const list = childrenByParent.get(person.fatherId) ?? [];
      list.push(person);
      childrenByParent.set(person.fatherId, list);
    }
    if (person.motherId) {
      const list = childrenByParent.get(person.motherId) ?? [];
      list.push(person);
      childrenByParent.set(person.motherId, list);
    }
  }

  const spousesByPerson = new Map<string, string[]>();
  for (const marriage of marriages) {
    const s1 = spousesByPerson.get(marriage.person1Id) ?? [];
    if (!s1.includes(marriage.person2Id)) s1.push(marriage.person2Id);
    spousesByPerson.set(marriage.person1Id, s1);

    const s2 = spousesByPerson.get(marriage.person2Id) ?? [];
    if (!s2.includes(marriage.person1Id)) s2.push(marriage.person1Id);
    spousesByPerson.set(marriage.person2Id, s2);
  }

  return persons.map((person) => {
    const { primary, secondary } = formatPersonDisplayName(person);
    const parents = [person.fatherId, person.motherId].filter(
      (id): id is string => Boolean(id)
    );
    const rawChildren = childrenByParent.get(person.id) ?? [];
    const sortedChildren = sortChildren(rawChildren, childOrderMode).map(
      (child) => child.id
    );
    const spouses = spousesByPerson.get(person.id) ?? [];

    return {
      id: person.id,
      data: {
        displayName: primary,
        hanjaName: secondary ?? "",
        nameKo: person.nameKo ?? "",
        nameHanja: person.nameHanja ?? "",
        surnameKo: person.surnameKo ?? "",
        surnameHanja: person.surnameHanja ?? "",
        bonKo: person.bonKo ?? "",
        bonHanja: person.bonHanja ?? "",
        gender: person.gender === "FEMALE" ? "F" : "M",
        actualGender: person.gender,
        birthDate: person.birthDate ?? "",
        deathDate: person.deathDate ?? "",
        birthOrder: person.birthOrder != null ? String(person.birthOrder) : "",
        memo: person.memo ?? "",
        motherId: person.motherId ?? "",
      },
      rels: {
        parents,
        children: sortedChildren,
        spouses,
      },
    };
  });
}

function parseGender(data: Partial<FamilyChartPersonData>): Gender {
  if (data.gender === "F") return "FEMALE";
  if (data.gender === "M") return "MALE";
  if (data.actualGender === "OTHER") return "OTHER";
  if (data.actualGender === "FEMALE") return "FEMALE";
  return "MALE";
}

function parseBirthOrder(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Convert `family-chart` `editTree().setOnChange()` nodes back into normalized DB inputs.
 */
export function fromFamilyChartData(nodes: FamilyChartDatum[]): {
  persons: SyncPersonInput[];
  marriages: Array<{ person1Id: string; person2Id: string }>;
} {
  const validNodes = nodes.filter(
    (node) => node && typeof node.id === "string" && !node.unknown && !node.to_add
  );
  const validIdSet = new Set(validNodes.map((n) => n.id));

  const genderById = new Map<string, Gender>();
  for (const node of validNodes) {
    genderById.set(node.id, parseGender(node.data));
  }

  const seenIds = new Set<string>();
  const persons: SyncPersonInput[] = [];
  for (const node of validNodes) {
    if (seenIds.has(node.id)) continue;
    seenIds.add(node.id);

    const parentIds = (node.rels?.parents ?? []).filter(
      (pid) => Boolean(pid) && validIdSet.has(pid)
    );
    let fatherId: string | null = null;
    let motherId: string | null = null;

    for (const pid of parentIds) {
      const parentGender = genderById.get(pid);
      if (parentGender === "FEMALE" && !motherId) {
        motherId = pid;
      } else if (!fatherId) {
        fatherId = pid;
      } else if (!motherId) {
        motherId = pid;
      }
    }

    const explicitMotherId = cleanStr(node.data?.motherId);
    if (explicitMotherId && validIdSet.has(explicitMotherId) && explicitMotherId !== fatherId) {
      motherId = explicitMotherId;
    }

    persons.push({
      id: node.id,
      nameKo: cleanStr(node.data?.nameKo),
      nameHanja: cleanStr(node.data?.nameHanja),
      surnameKo: cleanStr(node.data?.surnameKo),
      surnameHanja: cleanStr(node.data?.surnameHanja),
      bonKo: cleanStr(node.data?.bonKo),
      bonHanja: cleanStr(node.data?.bonHanja),
      gender: parseGender(node.data ?? {}),
      birthDate: cleanStr(node.data?.birthDate),
      deathDate: cleanStr(node.data?.deathDate),
      birthOrder: parseBirthOrder(node.data?.birthOrder),
      memo: cleanStr(node.data?.memo),
      fatherId,
      motherId,
    });
  }

  const marriageSet = new Set<string>();
  const marriages: Array<{ person1Id: string; person2Id: string }> = [];

  for (const node of validNodes) {
    for (const spouseId of node.rels?.spouses ?? []) {
      if (!spouseId || spouseId === node.id || !validIdSet.has(spouseId)) continue;
      const [person1Id, person2Id] =
        node.id < spouseId ? [node.id, spouseId] : [spouseId, node.id];
      const key = `${person1Id}:${person2Id}`;
      if (!marriageSet.has(key)) {
        marriageSet.add(key);
        marriages.push({ person1Id, person2Id });
      }
    }
  }

  return { persons, marriages };
}

export type DeletePersonCheckResult =
  | { deletable: true }
  | { deletable: false; reason: string };

function countConnectedComponents(nodes: FamilyChartDatum[]): number {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    adj.set(id, new Set());
  }

  for (const node of nodes) {
    const neighbors = [
      ...(node.rels?.parents ?? []),
      ...(node.rels?.children ?? []),
      ...(node.rels?.spouses ?? []),
    ];
    for (const relId of neighbors) {
      if (relId !== node.id && nodeIds.has(relId)) {
        adj.get(node.id)!.add(relId);
        adj.get(relId)!.add(node.id);
      }
    }
  }

  const visited = new Set<string>();
  let components = 0;

  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    components += 1;
    const queue = [id];
    visited.add(id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adj.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  return components;
}

/**
 * Verify whether removing `personId` is safe (i.e. it is a leaf node and
 * removing it does not disconnect remaining nodes into separate components).
 */
export function canDeletePersonInGraph(
  personId: string,
  nodes: FamilyChartDatum[]
): DeletePersonCheckResult {
  const realNodes = nodes.filter(
    (n) =>
      n &&
      typeof n.id === "string" &&
      !n.unknown &&
      !n.to_add &&
      !(n as { _new_rel_data?: unknown })._new_rel_data
  );

  const realIdSet = new Set(realNodes.map((n) => n.id));
  const target = realNodes.find((n) => n.id === personId);
  if (!target) {
    return { deletable: true };
  }

  const hasChild = (target.rels?.children ?? []).some(
    (cid) => cid !== personId && realIdSet.has(cid)
  );
  if (hasChild) {
    return {
      deletable: false,
      reason:
        "마지막 노드가 아니므로 삭제할 수 없습니다. 하위(자녀) 인물부터 먼저 삭제해 주세요.",
    };
  }

  const remainingNodes = realNodes.filter((n) => n.id !== personId);
  if (remainingNodes.length <= 1) {
    return { deletable: true };
  }

  const beforeComponents = countConnectedComponents(realNodes);
  const afterComponents = countConnectedComponents(remainingNodes);
  if (afterComponents > beforeComponents) {
    return {
      deletable: false,
      reason:
        "마지막 노드가 아니므로 삭제할 수 없습니다. 삭제 시 연결이 끊어지는 미연결 인물이 발생합니다.",
    };
  }

  return { deletable: true };
}

export interface TreeOriginDefaults {
  surnameKo?: string | null;
  surnameHanja?: string | null;
  bonKo?: string | null;
  bonHanja?: string | null;
}

export type NewRelDatum = FamilyChartDatum & {
  _new_rel_data?: {
    rel_type?: string;
    rel_id?: string;
    other_parent_id?: string;
  };
};

function hasOriginValues(origin: TreeOriginDefaults): boolean {
  return Boolean(
    cleanStr(origin.surnameKo) ||
      cleanStr(origin.surnameHanja) ||
      cleanStr(origin.bonKo) ||
      cleanStr(origin.bonHanja)
  );
}

function nodeHasOriginInfo(node: FamilyChartDatum): boolean {
  return Boolean(cleanStr(node.data?.surnameKo) || cleanStr(node.data?.bonKo));
}

function personMatchesTreeOrigin(
  node: FamilyChartDatum,
  origin: TreeOriginDefaults
): boolean {
  const treeSurname = cleanStr(origin.surnameKo);
  const treeBon = cleanStr(origin.bonKo);
  const nodeSurname = cleanStr(node.data?.surnameKo);
  const nodeBon = cleanStr(node.data?.bonKo);

  if (treeSurname) {
    if (nodeSurname !== treeSurname) return false;
    if (treeBon && nodeBon && nodeBon !== treeBon) return false;
    return true;
  }
  if (treeBon) {
    return nodeBon === treeBon;
  }
  return false;
}

/**
 * Determine whether a newly created relative form should pre-fill the tree's
 * global surname/clan-origin (`surnameKo`, `surnameHanja`, `bonKo`, `bonHanja`).
 * Excludes spouses, mothers, and maternal-line descendants (외손).
 */
export function shouldAutoFillTreeOrigin(
  datum: NewRelDatum | undefined,
  nodes: FamilyChartDatum[],
  origin: TreeOriginDefaults
): boolean {
  if (!datum || !hasOriginValues(origin)) return false;
  const newRel = datum._new_rel_data;
  if (!newRel) return false;

  const relType = newRel.rel_type;
  if (relType === "spouse" || relType === "mother") {
    return false;
  }

  const realNodes = nodes.filter(
    (n) =>
      n &&
      typeof n.id === "string" &&
      !n.unknown &&
      !n.to_add &&
      !(n as { _new_rel_data?: unknown })._new_rel_data
  );

  const relParent = newRel.rel_id
    ? realNodes.find((n) => n.id === newRel.rel_id)
    : undefined;

  if (relType === "father") {
    if (!relParent) return true;
    return !nodeHasOriginInfo(relParent) || personMatchesTreeOrigin(relParent, origin);
  }

  if (relType === "son" || relType === "daughter") {
    if (!relParent) return false;

    const otherParent = newRel.other_parent_id
      ? realNodes.find((n) => n.id === newRel.other_parent_id)
      : undefined;

    let father: FamilyChartDatum | undefined;
    if (relParent.data?.gender !== "F") {
      father = relParent;
    } else if (otherParent && otherParent.data?.gender !== "F") {
      father = otherParent;
    } else if (!newRel.other_parent_id) {
      const spouseCandidates = (relParent.rels?.spouses ?? [])
        .map((sid) => realNodes.find((n) => n.id === sid))
        .filter((n): n is FamilyChartDatum => Boolean(n && n.data?.gender !== "F"));
      if (spouseCandidates.length === 1) {
        father = spouseCandidates[0];
      }
    }

    if (!father) return false;

    if (nodeHasOriginInfo(father)) {
      return personMatchesTreeOrigin(father, origin);
    }

    // Father has no surname/bon yet: allow auto-fill only when adding directly from the father
    return relParent.id === father.id;
  }

  return false;
}

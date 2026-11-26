import { describe, expect, it } from "vitest";
import type { Marriage, Person } from "@prisma/client";
import {
  formatPersonDisplayName,
  fromFamilyChartData,
  sortChildren,
  toFamilyChartData,
} from "@/lib/family-graph";

function makePerson(overrides: Partial<Person> & { id: string }): Person {
  return {
    treeId: "tree-1",
    nameKo: null,
    nameHanja: null,
    surnameKo: null,
    surnameHanja: null,
    bonKo: null,
    bonHanja: null,
    gender: "MALE",
    birthDate: null,
    deathDate: null,
    birthOrder: null,
    memo: null,
    fatherId: null,
    motherId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("formatPersonDisplayName", () => {
  it("formats Korean name and Hanja name when both exist", () => {
    expect(
      formatPersonDisplayName({
        nameKo: "홍길동",
        nameHanja: "洪吉童",
        surnameKo: "홍",
        bonKo: "남양",
      })
    ).toEqual({ primary: "홍길동", secondary: "洪吉童" });
  });

  it("formats spouse without given name using bonKo and surnameKo", () => {
    expect(
      formatPersonDisplayName({
        nameKo: null,
        nameHanja: null,
        surnameKo: "김",
        bonKo: "김해",
      })
    ).toEqual({ primary: "김해 김씨", secondary: null });
  });

  it("formats spouse with only surnameKo and no bonKo", () => {
    expect(
      formatPersonDisplayName({
        nameKo: null,
        nameHanja: null,
        surnameKo: "이",
        bonKo: null,
      })
    ).toEqual({ primary: "이씨", secondary: null });
  });
});

describe("sortChildren", () => {
  const c1 = makePerson({
    id: "c1",
    gender: "FEMALE",
    birthOrder: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  const c2 = makePerson({
    id: "c2",
    gender: "MALE",
    birthOrder: 2,
    createdAt: new Date("2026-01-02T00:00:00Z"),
  });
  const c3 = makePerson({
    id: "c3",
    gender: "MALE",
    birthOrder: null,
    createdAt: new Date("2026-01-03T00:00:00Z"),
  });
  const c4 = makePerson({
    id: "c4",
    gender: "FEMALE",
    birthOrder: 3,
    createdAt: new Date("2026-01-04T00:00:00Z"),
  });

  it("sorts by birthOrder ascending with nulls last in BY_ORDER mode", () => {
    const sorted = sortChildren([c3, c2, c4, c1], "BY_ORDER");
    expect(sorted.map((c) => c.id)).toEqual(["c1", "c2", "c4", "c3"]);
  });

  it("sorts males before females and by birthOrder (nulls last) in BY_GENDER_THEN_ORDER mode", () => {
    const sorted = sortChildren([c4, c3, c1, c2], "BY_GENDER_THEN_ORDER");
    expect(sorted.map((c) => c.id)).toEqual(["c2", "c3", "c1", "c4"]);
  });
});

describe("toFamilyChartData & fromFamilyChartData", () => {
  const father = makePerson({
    id: "f1",
    nameKo: "김철수",
    nameHanja: "金哲秀",
    surnameKo: "김",
    surnameHanja: "金",
    bonKo: "김해",
    bonHanja: "金海",
    gender: "MALE",
  });
  const mother = makePerson({
    id: "m1",
    nameKo: null,
    surnameKo: "이",
    surnameHanja: "李",
    bonKo: "전주",
    bonHanja: "全州",
    gender: "FEMALE",
  });
  const daughter = makePerson({
    id: "d1",
    nameKo: "김영희",
    gender: "FEMALE",
    birthOrder: 1,
    fatherId: "f1",
    motherId: "m1",
  });
  const son = makePerson({
    id: "s1",
    nameKo: "김민수",
    gender: "MALE",
    birthOrder: 2,
    fatherId: "f1",
    motherId: "m1",
  });
  const otherChild = makePerson({
    id: "o1",
    nameKo: "김하늘",
    gender: "OTHER",
    birthOrder: 3,
    fatherId: "f1",
    motherId: "m1",
  });

  const marriage: Marriage = {
    id: "mar-1",
    treeId: "tree-1",
    person1Id: "f1",
    person2Id: "m1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  it("builds bidirectional family-chart nodes with sorted children and safe gender mapping", () => {
    const nodes = toFamilyChartData(
      [father, mother, daughter, son, otherChild],
      [marriage],
      "BY_GENDER_THEN_ORDER"
    );

    const fatherNode = nodes.find((n) => n.id === "f1");
    expect(fatherNode?.rels.spouses).toEqual(["m1"]);
    expect(fatherNode?.rels.children).toEqual(["s1", "d1", "o1"]);

    const motherNode = nodes.find((n) => n.id === "m1");
    expect(motherNode?.data.displayName).toBe("전주 이씨");
    expect(motherNode?.rels.spouses).toEqual(["f1"]);

    const otherNode = nodes.find((n) => n.id === "o1");
    expect(otherNode?.data.gender).toBe("M");
    expect(otherNode?.data.actualGender).toBe("OTHER");
    expect(otherNode?.rels.parents).toEqual(["f1", "m1"]);
  });

  it("round-trips family-chart nodes back into persons and deduplicated normalized marriages", () => {
    const nodes = toFamilyChartData(
      [father, mother, daughter, son],
      [marriage],
      "BY_ORDER"
    );
    const synced = fromFamilyChartData(nodes);

    const syncedDaughter = synced.persons.find((p) => p.id === "d1");
    expect(syncedDaughter?.fatherId).toBe("f1");
    expect(syncedDaughter?.motherId).toBe("m1");
    expect(synced.marriages).toEqual([{ person1Id: "f1", person2Id: "m1" }]);
  });
});

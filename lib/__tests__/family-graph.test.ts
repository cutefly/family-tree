import { describe, expect, it } from "vitest";
import type { Marriage, Person } from "@prisma/client";
import {
  canDeletePersonInGraph,
  formatPersonDisplayName,
  fromFamilyChartData,
  shouldAutoFillTreeOrigin,
  sortChildren,
  toFamilyChartData,
  type NewRelDatum,
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

  it("respects edited data.gender even when stale actualGender is present and skips unknown nodes", () => {
    const nodes = toFamilyChartData([mother], [], "BY_ORDER");
    // Simulate family-chart editTree changing gender from 'F' to 'M'
    nodes[0].data.gender = "M";
    const unknownNode = {
      ...nodes[0],
      id: "unk-1",
      unknown: true,
    } as unknown as (typeof nodes)[0];

    const synced = fromFamilyChartData([...nodes, unknownNode]);
    expect(synced.persons).toHaveLength(1);
    expect(synced.persons[0].gender).toBe("MALE");
  });
});

describe("canDeletePersonInGraph", () => {
  it("blocks deleting a parent who still has children", () => {
    const parent = makePerson({ id: "p1", nameKo: "부모", gender: "MALE" });
    const child = makePerson({ id: "c1", nameKo: "자녀", fatherId: "p1" });
    const nodes = toFamilyChartData([parent, child], [], "BY_ORDER");

    expect(canDeletePersonInGraph("p1", nodes)).toEqual({
      deletable: false,
      reason: expect.stringContaining("마지막 노드가 아니므로"),
    });
    expect(canDeletePersonInGraph("c1", nodes)).toEqual({ deletable: true });
  });

  it("blocks deleting an intermediate node whose removal disconnects a spouse", () => {
    const grandParent = makePerson({ id: "gp", nameKo: "조부", gender: "MALE" });
    const son = makePerson({ id: "son", nameKo: "아들", gender: "MALE", fatherId: "gp" });
    const spouse = makePerson({ id: "sp", nameKo: "며느리", gender: "FEMALE" });
    const marriage: Marriage = {
      id: "mar-1",
      treeId: "tree-1",
      person1Id: "son",
      person2Id: "sp",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    const nodes = toFamilyChartData([grandParent, son, spouse], [marriage], "BY_ORDER");

    // Removing son disconnects spouse from grandParent
    expect(canDeletePersonInGraph("son", nodes)).toEqual({
      deletable: false,
      reason: expect.stringContaining("미연결"),
    });
    // Spouse is a leaf node and can be deleted safely
    expect(canDeletePersonInGraph("sp", nodes)).toEqual({ deletable: true });
  });

  it("allows deleting the last remaining person and ignores unknown/to_add nodes", () => {
    const only = makePerson({ id: "only", nameKo: "시조" });
    const nodes = toFamilyChartData([only], [], "BY_ORDER");
    const dummy = { ...nodes[0], id: "dummy-add", to_add: true };
    nodes[0].rels.children.push("dummy-add");

    expect(canDeletePersonInGraph("only", [...nodes, dummy])).toEqual({
      deletable: true,
    });
  });
});

describe("shouldAutoFillTreeOrigin", () => {
  const origin = {
    surnameKo: "김",
    surnameHanja: "金",
    bonKo: "김해",
    bonHanja: "金海",
  };

  it("returns true for paternal-line children and father, false for spouse and mother", () => {
    const father = makePerson({
      id: "f1",
      nameKo: "김철수",
      surnameKo: "김",
      bonKo: "김해",
      gender: "MALE",
    });
    const nodes = toFamilyChartData([father], [], "BY_ORDER");

    const newSon: NewRelDatum = {
      ...nodes[0],
      id: "new-son",
      _new_rel_data: { rel_type: "son", rel_id: "f1" },
    };
    const newSpouse: NewRelDatum = {
      ...nodes[0],
      id: "new-spouse",
      _new_rel_data: { rel_type: "spouse", rel_id: "f1" },
    };
    const newMother: NewRelDatum = {
      ...nodes[0],
      id: "new-mother",
      _new_rel_data: { rel_type: "mother", rel_id: "f1" },
    };
    const newFather: NewRelDatum = {
      ...nodes[0],
      id: "new-father",
      _new_rel_data: { rel_type: "father", rel_id: "f1" },
    };

    expect(shouldAutoFillTreeOrigin(newSon, nodes, origin)).toBe(true);
    expect(shouldAutoFillTreeOrigin(newFather, nodes, origin)).toBe(true);
    expect(shouldAutoFillTreeOrigin(newSpouse, nodes, origin)).toBe(false);
    expect(shouldAutoFillTreeOrigin(newMother, nodes, origin)).toBe(false);
  });

  it("returns true when adding a child from daughter-in-law whose husband matches tree origin", () => {
    const husband = makePerson({
      id: "h1",
      nameKo: "김영수",
      surnameKo: "김",
      bonKo: "김해",
      gender: "MALE",
    });
    const wife = makePerson({
      id: "w1",
      nameKo: "이영희",
      surnameKo: "이",
      bonKo: "전주",
      gender: "FEMALE",
    });
    const marriage: Marriage = {
      id: "m1",
      treeId: "tree-1",
      person1Id: "h1",
      person2Id: "w1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    const nodes = toFamilyChartData([husband, wife], [marriage], "BY_ORDER");

    const childFromMother: NewRelDatum = {
      ...nodes[0],
      id: "new-child",
      _new_rel_data: { rel_type: "son", rel_id: "w1", other_parent_id: "h1" },
    };

    expect(shouldAutoFillTreeOrigin(childFromMother, nodes, origin)).toBe(true);
  });

  it("returns false for maternal-line grandchildren (외손)", () => {
    const daughter = makePerson({
      id: "d1",
      nameKo: "김민지",
      surnameKo: "김",
      bonKo: "김해",
      gender: "FEMALE",
    });
    const sonInLaw = makePerson({
      id: "sil1",
      nameKo: "박준호",
      surnameKo: "박",
      bonKo: "밀양",
      gender: "MALE",
    });
    const marriage: Marriage = {
      id: "m1",
      treeId: "tree-1",
      person1Id: "d1",
      person2Id: "sil1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    const nodes = toFamilyChartData([daughter, sonInLaw], [marriage], "BY_ORDER");

    const maternalGrandchild: NewRelDatum = {
      ...nodes[0],
      id: "new-gc",
      _new_rel_data: { rel_type: "daughter", rel_id: "d1", other_parent_id: "sil1" },
    };
    const grandchildFromFather: NewRelDatum = {
      ...nodes[0],
      id: "new-gc-2",
      _new_rel_data: { rel_type: "son", rel_id: "sil1" },
    };

    expect(shouldAutoFillTreeOrigin(maternalGrandchild, nodes, origin)).toBe(false);
    expect(shouldAutoFillTreeOrigin(grandchildFromFather, nodes, origin)).toBe(false);

    // Also returns false when adding a child from a daughter with no spouse recorded
    const singleDaughterNodes = toFamilyChartData([daughter], [], "BY_ORDER");
    const singleDaughterChild: NewRelDatum = {
      ...singleDaughterNodes[0],
      id: "new-gc-3",
      _new_rel_data: { rel_type: "son", rel_id: "d1" },
    };
    expect(shouldAutoFillTreeOrigin(singleDaughterChild, singleDaughterNodes, origin)).toBe(false);
  });

  it("returns false when origin defaults are empty or editing an existing person", () => {
    const father = makePerson({ id: "f1", nameKo: "김철수", gender: "MALE" });
    const nodes = toFamilyChartData([father], [], "BY_ORDER");
    const newSon: NewRelDatum = {
      ...nodes[0],
      id: "new-son",
      _new_rel_data: { rel_type: "son", rel_id: "f1" },
    };

    expect(shouldAutoFillTreeOrigin(newSon, nodes, {})).toBe(false);
    expect(shouldAutoFillTreeOrigin(nodes[0], nodes, origin)).toBe(false);
  });
});

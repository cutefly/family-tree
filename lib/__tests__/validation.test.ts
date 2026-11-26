import { describe, expect, it } from "vitest";
import {
  ValidationError,
  normalizeSpousePair,
  validateParentLinks,
  validatePersonName,
} from "@/lib/validation";

describe("validatePersonName", () => {
  it("throws ValidationError when both nameKo and surnameKo are empty", () => {
    expect(() => validatePersonName({ nameKo: "", surnameKo: "  " })).toThrow(
      ValidationError
    );
    expect(() =>
      validatePersonName({ nameKo: null, surnameKo: null })
    ).toThrow(ValidationError);
  });

  it("passes when either nameKo or surnameKo is provided", () => {
    expect(() =>
      validatePersonName({ nameKo: "홍길동", surnameKo: null })
    ).not.toThrow();
    expect(() =>
      validatePersonName({ nameKo: null, surnameKo: "김" })
    ).not.toThrow();
  });
});

describe("normalizeSpousePair", () => {
  it("sorts spouse IDs lexicographically", () => {
    expect(normalizeSpousePair("p-b", "p-a")).toEqual(["p-a", "p-b"]);
    expect(normalizeSpousePair("p-a", "p-b")).toEqual(["p-a", "p-b"]);
  });

  it("throws ValidationError when marrying oneself", () => {
    expect(() => normalizeSpousePair("p-a", "p-a")).toThrow(ValidationError);
  });
});

describe("validateParentLinks", () => {
  it("passes for valid acyclic family links", () => {
    expect(() =>
      validateParentLinks([
        { id: "gp", fatherId: null, motherId: null },
        { id: "p", fatherId: "gp", motherId: null },
        { id: "c", fatherId: "p", motherId: null },
      ])
    ).not.toThrow();
  });

  it("rejects self-parenting", () => {
    expect(() =>
      validateParentLinks([{ id: "a", fatherId: "a", motherId: null }])
    ).toThrow(ValidationError);
  });

  it("rejects identical fatherId and motherId", () => {
    expect(() =>
      validateParentLinks([
        { id: "p", fatherId: null, motherId: null },
        { id: "c", fatherId: "p", motherId: "p" },
      ])
    ).toThrow(ValidationError);
  });

  it("rejects direct and multi-generation parent cycles", () => {
    expect(() =>
      validateParentLinks([
        { id: "a", fatherId: "b", motherId: null },
        { id: "b", fatherId: "a", motherId: null },
      ])
    ).toThrow(ValidationError);

    expect(() =>
      validateParentLinks([
        { id: "gp", fatherId: "c", motherId: null },
        { id: "p", fatherId: "gp", motherId: null },
        { id: "c", fatherId: "p", motherId: null },
      ])
    ).toThrow(ValidationError);
  });
});

import { describe, expect, it } from "vitest"
import { GROUPS, NOTIFICATION_CATEGORIES } from "./constants.js"

describe("GROUPS", () => {
  it("has 17 groups", () => {
    expect(Object.keys(GROUPS)).toHaveLength(17)
  })

  it("each group has id and name", () => {
    for (const [code, group] of Object.entries(GROUPS)) {
      expect(group.id).toBeTypeOf("string")
      expect(group.id).not.toBe("")
      expect(group.name).toBeTypeOf("string")
      expect(group.name).not.toBe("")
      expect(code).toBeTypeOf("string")
    }
  })

  it("nmixx has id 14", () => {
    expect(GROUPS.nmixx.id).toBe("14")
    expect(GROUPS.nmixx.name).toBe("NMIXX")
  })

  it("twice has id 9", () => {
    expect(GROUPS.twice.id).toBe("9")
    expect(GROUPS.twice.name).toBe("TWICE")
  })

  it("straykids has id 10", () => {
    expect(GROUPS.straykids.id).toBe("10")
    expect(GROUPS.straykids.name).toBe("Stray Kids")
  })
})

describe("NOTIFICATION_CATEGORIES", () => {
  it("has 6 categories", () => {
    expect(Object.keys(NOTIFICATION_CATEGORIES)).toHaveLength(6)
  })

  it("each value equals its key", () => {
    for (const [key, value] of Object.entries(NOTIFICATION_CATEGORIES)) {
      expect(value).toBe(key)
    }
  })

  it("POST_CREATED_BY_ARTIST is correct", () => {
    expect(NOTIFICATION_CATEGORIES.POST_CREATED_BY_ARTIST).toBe("POST_CREATED_BY_ARTIST")
  })
})

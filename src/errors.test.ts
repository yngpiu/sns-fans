import { describe, expect, it } from "vitest"
import { FansAuthError, FansError, FansValidationError } from "./errors.js"

describe("FansError", () => {
  it("creates with message and name", () => {
    const err = new FansError("something went wrong")
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe("something went wrong")
    expect(err.name).toBe("FansError")
  })
})

describe("FansAuthError", () => {
  it("extends FansError", () => {
    const err = new FansAuthError("token expired")
    expect(err).toBeInstanceOf(FansError)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe("token expired")
    expect(err.name).toBe("FansAuthError")
  })
})

describe("FansValidationError", () => {
  it("extends FansError", () => {
    const err = new FansValidationError("invalid code")
    expect(err).toBeInstanceOf(FansError)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe("invalid code")
    expect(err.name).toBe("FansValidationError")
  })
})

import { describe, expect, it } from "vitest"
import { TokenManager } from "./auth.js"

function makeToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const body = btoa(JSON.stringify(payload))
  return `${header}.${body}.signature`
}

describe("TokenManager", () => {
  it("stores token and credentials", () => {
    const tm = new TokenManager({
      token: "abc.def.ghi",
      clientUuid: "web-123",
      guid: "guid-123",
    })
    expect(tm.getToken()).toBe("abc.def.ghi")
    expect(tm.getClientUuid()).toBe("web-123")
    expect(tm.getGuid()).toBe("guid-123")
  })

  it("decode() returns payload for valid JWT", () => {
    const token = makeToken({ sub: "42", exp: 9999999999, iat: 1700000000 })
    const decoded = new TokenManager({
      token,
      clientUuid: "web-1",
      guid: "g-1",
    }).decode()
    expect(decoded).not.toBeNull()
    expect(decoded?.sub).toBe("42")
    expect(decoded?.exp).toBe(9999999999)
  })

  it("decode() returns null for invalid JWT", () => {
    const decoded = new TokenManager({
      token: "not-a-jwt",
      clientUuid: "web-1",
      guid: "g-1",
    }).decode()
    expect(decoded).toBeNull()
  })

  it("decode() returns null for malformed base64", () => {
    const decoded = new TokenManager({
      token: "a.b\x01c.sig",
      clientUuid: "web-1",
      guid: "g-1",
    }).decode()
    expect(decoded).toBeNull()
  })

  it("getRemainingSeconds returns time until expiry", () => {
    const future = Math.floor(Date.now() / 1000) + 3600
    const tm = new TokenManager({
      token: makeToken({ sub: "1", exp: future, iat: Date.now() / 1000 }),
      clientUuid: "web-1",
      guid: "g-1",
    })
    const remaining = tm.getRemainingSeconds()
    expect(remaining).toBeGreaterThan(3500)
    expect(remaining).toBeLessThanOrEqual(3600)
  })

  it("getRemainingSeconds returns 0 for expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 3600
    const tm = new TokenManager({
      token: makeToken({ sub: "1", exp: past, iat: past - 3600 }),
      clientUuid: "web-1",
      guid: "g-1",
    })
    expect(tm.getRemainingSeconds()).toBe(0)
  })

  it("getRemainingSeconds returns 0 for invalid token", () => {
    const tm = new TokenManager({
      token: "bad",
      clientUuid: "web-1",
      guid: "g-1",
    })
    expect(tm.getRemainingSeconds()).toBe(0)
  })

  it("isExpired returns true for expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 60
    const tm = new TokenManager({
      token: makeToken({ sub: "1", exp: past, iat: past - 3600 }),
      clientUuid: "web-1",
      guid: "g-1",
    })
    expect(tm.isExpired()).toBe(true)
  })

  it("isExpired returns false for valid token", () => {
    const future = Math.floor(Date.now() / 1000) + 3600
    const tm = new TokenManager({
      token: makeToken({ sub: "1", exp: future }),
      clientUuid: "web-1",
      guid: "g-1",
    })
    expect(tm.isExpired()).toBe(false)
  })

  it("shouldRefresh returns true when less than 5 min remaining", () => {
    const almostExpired = Math.floor(Date.now() / 1000) + 120
    const tm = new TokenManager({
      token: makeToken({ sub: "1", exp: almostExpired }),
      clientUuid: "web-1",
      guid: "g-1",
    })
    expect(tm.shouldRefresh()).toBe(true)
  })

  it("shouldRefresh returns false when plenty of time left", () => {
    const farFuture = Math.floor(Date.now() / 1000) + 7200
    const tm = new TokenManager({
      token: makeToken({ sub: "1", exp: farFuture }),
      clientUuid: "web-1",
      guid: "g-1",
    })
    expect(tm.shouldRefresh()).toBe(false)
  })
})

import * as fs from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FansClient } from "./client.js"
import type { Notification } from "./types.js"

const VALID_TOKEN = makeToken({ sub: "1", iat: 1704000000, exp: 9999999999 })

let stateId = 0

function makeToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${header}.${body}.signature`
}

type PrivateClient = {
  validateGroupCode(code: string): void
  check(): Promise<void>
  auth: { refresh: () => Promise<string> }
}

function priv(client: FansClient): PrivateClient {
  return client as unknown as PrivateClient
}

afterEach(() => {
  vi.restoreAllMocks()
  const files = fs
    .readdirSync(".")
    .filter((f) => f.startsWith("fans_state_") && f.endsWith(".json"))
  for (const file of files) {
    try {
      fs.unlinkSync(file)
    } catch {
      /* ignore */
    }
  }
})

function createClient() {
  stateId++
  return new FansClient({
    token: VALID_TOKEN,
    clientUuid: "web-test",
    guid: "guid-test",
    stateFile: `fans_state_${stateId}.json`,
  })
}

describe("FansClient constructor", () => {
  it("creates instance with token config", () => {
    const client = createClient()
    expect(client).toBeInstanceOf(FansClient)
  })
})

describe("validateGroupCode", () => {
  it("accepts lowercase codes", () => {
    const client = createClient()
    expect(() => priv(client).validateGroupCode("nmixx")).not.toThrow()
    expect(() => priv(client).validateGroupCode("twice")).not.toThrow()
  })

  it("accepts uppercase display names", () => {
    const client = createClient()
    expect(() => priv(client).validateGroupCode("NMIXX")).not.toThrow()
    expect(() => priv(client).validateGroupCode("TWICE")).not.toThrow()
  })

  it("throws FansValidationError for unknown codes", () => {
    const client = createClient()
    expect(() => priv(client).validateGroupCode("unknown_group")).toThrowError("Unknown group")
  })

  it("throws for empty string", () => {
    const client = createClient()
    expect(() => priv(client).validateGroupCode("")).toThrowError("Unknown group")
  })
})

describe("watch()", () => {
  it("returns WatcherHandle with onNotification, onWebhook, remove", () => {
    const client = createClient()
    const w = client.watch({ groupCodes: "NMIXX" })
    expect(w).toHaveProperty("onNotification")
    expect(w).toHaveProperty("onWebhook")
    expect(w).toHaveProperty("remove")
    expect(typeof w.onNotification).toBe("function")
    expect(typeof w.onWebhook).toBe("function")
    expect(typeof w.remove).toBe("function")
  })

  it("accepts uppercase display names in groupCodes", () => {
    const client = createClient()
    expect(() => client.watch({ groupCodes: "NMIXX" })).not.toThrow()
    expect(() => client.watch({ groupCodes: ["TWICE", "ITZY"] })).not.toThrow()
  })

  it("accepts lowercase codes in groupCodes", () => {
    const client = createClient()
    expect(() => client.watch({ groupCodes: "nmixx" })).not.toThrow()
    expect(() => client.watch({ groupCodes: ["twice", "itzy"] })).not.toThrow()
  })

  it("accepts categories via NOTIFICATION_CATEGORIES constants", () => {
    const client = createClient()
    expect(() =>
      client.watch({
        groupCodes: "NMIXX",
        categories: ["POST_CREATED_BY_ARTIST"],
      }),
    ).not.toThrow()
  })

  it("accepts interval option", () => {
    const client = createClient()
    expect(() => client.watch({ groupCodes: "NMIXX", interval: 30 })).not.toThrow()
  })

  it("accepts a stable watcher id for persisted state", () => {
    const client = createClient()
    expect(() => client.watch({ id: "nmixx-posts", groupCodes: "NMIXX" })).not.toThrow()
  })

  it("can post to a Discord webhook URL", async () => {
    stateId++
    const stateFile = `fans_state_${stateId}.json`
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ watchers: { "nmixx-posts": { seenIds: ["1"] } } }),
      "utf-8",
    )

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    })
    vi.stubGlobal("fetch", fetchMock)

    const client = new FansClient({
      token: VALID_TOKEN,
      clientUuid: "web-test",
      guid: "guid-test",
      stateFile,
    })
    const watcher = client.watch({ id: "nmixx-posts", groupCodes: "NMIXX", interval: 1000 })
    watcher.onWebhook("https://discord.com/api/webhooks/123/abc")

    vi.spyOn(client, "getNotifications").mockResolvedValue([
      {
        id: "1",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "2026-07-03T12:00:00Z",
        updatedAt: "2026-07-03T12:00:00Z",
        message: "NMIXX posted a new post.",
        linkUrl: "/post/abc-123",
        group: { id: "14", name: "NMIXX", code: "nmixx" },
        postDetail: {
          id: "p1",
          slug: "abc-123",
          body: "Hello from Discord.",
          likeCount: 0,
          commentCount: 0,
        },
      } as Notification,
      {
        id: "2",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "2026-07-03T12:01:00Z",
        updatedAt: "2026-07-03T12:01:00Z",
        message: "NMIXX posted a new post.",
        linkUrl: "/post/abc-124",
        group: { id: "14", name: "NMIXX", code: "nmixx" },
      } as Notification,
    ])

    await priv(client).check()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://discord.com/api/webhooks/123/abc")
    const body = JSON.parse(init.body)
    expect(body.content).toContain("NMIXX")
    expect(body.embeds).toHaveLength(1)
    expect(body.embeds[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Category", value: "POST_CREATED_BY_ARTIST" }),
        expect.objectContaining({ name: "Group", value: "NMIXX" }),
      ]),
    )
  })

  it("keeps generic webhook payloads unchanged", async () => {
    stateId++
    const stateFile = `fans_state_${stateId}.json`
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ watchers: { "nmixx-generic": { seenIds: ["1"] } } }),
      "utf-8",
    )

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    })
    vi.stubGlobal("fetch", fetchMock)

    const client = new FansClient({
      token: VALID_TOKEN,
      clientUuid: "web-test",
      guid: "guid-test",
      stateFile,
    })
    const watcher = client.watch({ id: "nmixx-generic", groupCodes: "NMIXX", interval: 1000 })
    watcher.onWebhook("https://example.com/hook")

    vi.spyOn(client, "getNotifications").mockResolvedValue([
      {
        id: "1",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "2026-07-03T12:00:00Z",
        updatedAt: "2026-07-03T12:00:00Z",
        message: "NMIXX posted a new post.",
        linkUrl: "/post/abc-123",
        group: { id: "14", name: "NMIXX", code: "nmixx" },
      } as Notification,
      {
        id: "2",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "2026-07-03T12:01:00Z",
        updatedAt: "2026-07-03T12:01:00Z",
        message: "NMIXX posted a new post.",
        linkUrl: "/post/abc-124",
        group: { id: "14", name: "NMIXX", code: "nmixx" },
      } as Notification,
    ])

    await priv(client).check()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.event).toBe("notification")
    expect(body.message).toBe("NMIXX posted a new post.")
  })
})

describe("watch + check cycle", () => {
  it("handlers fire only for new notifications", async () => {
    const client = createClient()
    const handler = vi.fn()

    const spy = vi.spyOn(client, "getNotifications").mockResolvedValue([])

    const w = client.watch({
      groupCodes: "NMIXX",
      interval: 1000,
    })
    w.onNotification(handler)

    spy.mockResolvedValue([
      {
        id: "1",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "1",
        updatedAt: "1",
        group: { id: "14", name: "NMIXX", code: "nmixx" },
      },
    ])
    await priv(client).check()
    expect(handler).toHaveBeenCalledTimes(0)

    spy.mockResolvedValue([
      {
        id: "1",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "1",
        updatedAt: "1",
        group: { id: "14", name: "NMIXX", code: "nmixx" },
      },
      {
        id: "2",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "2",
        updatedAt: "2",
        group: { id: "14", name: "NMIXX", code: "nmixx" },
      },
    ])
    await priv(client).check()
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].id).toBe("2")
  })
})

describe("WatcherHandle.remove", () => {
  it("removes watcher", async () => {
    const client = createClient()
    const spy = vi.spyOn(client, "getNotifications").mockResolvedValue([])
    const w = client.watch({ groupCodes: "NMIXX", interval: 1000 })

    w.remove()

    await priv(client).check()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("watcher persistence", () => {
  it("restores seen notifications by stable watcher id", async () => {
    stateId++
    const stateFile = `fans_state_${stateId}.json`
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ watchers: { "nmixx-posts": { seenIds: ["1"] } } }),
      "utf-8",
    )

    const client = new FansClient({
      token: VALID_TOKEN,
      clientUuid: "web-test",
      guid: "guid-test",
      stateFile,
    })
    const handler = vi.fn()
    const spy = vi.spyOn(client, "getNotifications").mockResolvedValue([
      {
        id: "1",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "1",
        updatedAt: "1",
        group: { id: "14", name: "NMIXX", code: "nmixx" },
      },
      {
        id: "2",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "2",
        updatedAt: "2",
        group: { id: "14", name: "NMIXX", code: "nmixx" },
      },
    ])

    const watcher = client.watch({ id: "nmixx-posts", groupCodes: "NMIXX", interval: 1000 })
    watcher.onNotification(handler)

    await priv(client).check()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].id).toBe("2")
  })

  it("can disable state file persistence", async () => {
    const client = new FansClient({
      token: VALID_TOKEN,
      clientUuid: "web-test",
      guid: "guid-test",
      stateFile: false,
    })
    vi.spyOn(client, "getNotifications").mockResolvedValue([])

    client.watch({ groupCodes: "NMIXX", interval: 1000 })
    await priv(client).check()

    expect(
      fs.readdirSync(".").some((file) => file.startsWith("fans_state_") && file.endsWith(".json")),
    ).toBe(false)
  })
})

describe("getNotifications — mocked", () => {
  it("returns empty array when API returns no notifications", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { notifications: { objects: [] } } }),
      }),
    )

    const client = createClient()
    const result = await client.getNotifications()
    expect(result).toEqual([])
  })

  it("accepts a single group code string", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { notifications: { objects: [] } } }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const client = createClient()
    await client.getNotifications({ groupCodes: "NMIXX" })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.variables.filter.group_Overlap).toEqual(["14"])
  })

  it("handles 401 by retrying after refresh", async () => {
    let callCount = 0
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) return { status: 401, ok: false }
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { notifications: { objects: [{ id: "1" }] } } }),
        }
      }),
    )

    const client = createClient()
    vi.spyOn(priv(client).auth, "refresh").mockResolvedValue("new-token")

    const result = await client.getNotifications()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("1")
  })
})

describe("getPostDetail", () => {
  it("throws FansValidationError if slug is empty", async () => {
    const client = createClient()
    await expect(client.getPostDetail("")).rejects.toThrowError("slug is required")
  })

  it("returns post data on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            post: {
              id: "p1",
              slug: "test-post",
              body: "Hello world",
              likeCount: 10,
              commentCount: 2,
              attachments: [{ key: "img/abc.jpg" }],
            },
          },
        }),
      }),
    )

    const client = createClient()
    const post = await client.getPostDetail("test-post")
    expect(post).not.toBeNull()
    expect(post?.id).toBe("p1")
    expect(post?.body).toBe("Hello world")
    expect(post?.attachments).toHaveLength(1)
  })

  it("returns null when post not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { post: null } }),
      }),
    )

    const client = createClient()
    const post = await client.getPostDetail("non-existent")
    expect(post).toBeNull()
  })
})

describe("multiple watchers", () => {
  it("each watcher only receives its own group's notifications", async () => {
    const client = createClient()
    const spy = vi.spyOn(client, "getNotifications")

    const h1 = vi.fn()
    const h2 = vi.fn()
    const w1 = client.watch({ groupCodes: "TWICE", interval: 1000 })
    const w2 = client.watch({ groupCodes: "NMIXX", interval: 1000 })
    w1.onNotification(h1)
    w2.onNotification(h2)

    spy.mockResolvedValue([
      {
        id: "0",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "0",
        updatedAt: "0",
        group: { id: "9", name: "TWICE", code: "twice" },
      },
      {
        id: "1",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "1",
        updatedAt: "1",
        group: { id: "14", name: "NMIXX", code: "nmixx" },
      },
    ])
    await priv(client).check()
    expect(h1).toHaveBeenCalledTimes(0)
    expect(h2).toHaveBeenCalledTimes(0)

    spy.mockResolvedValue([
      {
        id: "0",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "0",
        updatedAt: "0",
        group: { id: "9", name: "TWICE", code: "twice" },
      },
      {
        id: "1",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "1",
        updatedAt: "1",
        group: { id: "14", name: "NMIXX", code: "nmixx" },
      },
      {
        id: "2",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "2",
        updatedAt: "2",
        group: { id: "9", name: "TWICE", code: "twice" },
      },
      {
        id: "3",
        category: "POST_CREATED_BY_ARTIST",
        classification: "COMMUNITY",
        createdAt: "3",
        updatedAt: "3",
        group: { id: "14", name: "NMIXX", code: "nmixx" },
      },
    ])
    await priv(client).check()

    expect(h1).toHaveBeenCalledTimes(1)
    expect(h1.mock.calls[0][0].id).toBe("2")
    expect(h2).toHaveBeenCalledTimes(1)
    expect(h2.mock.calls[0][0].id).toBe("3")
  })
})

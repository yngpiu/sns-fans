import fs from "node:fs"
import path from "node:path"
import { TokenManager } from "./auth.js"
import {
  API_URL,
  DEFAULT_HEADERS,
  GROUPS,
  type GroupCode,
  type GroupIdentifier,
  type NotificationCategory,
} from "./constants.js"
import { FansAuthError, FansError, FansValidationError } from "./errors.js"
import type {
  Notification,
  NotificationFilter,
  NotificationHandler,
  PostDetail,
  TokenConfig,
} from "./types.js"

// ----- Public API types -----

export interface FansClientConfig extends TokenConfig {
  /**
   * File used to persist seen notification IDs across restarts.
   * Defaults to `./fans_state.json`; set to `false` to disable persistence.
   */
  stateFile?: string | false
}

export interface WatchConfig {
  /**
   * Stable identifier for this watcher in the persisted state file.
   * If omitted, a deterministic key is derived from the watcher filters.
   */
  id?: string
  groupCodes?: GroupIdentifier | GroupIdentifier[]
  categories?: NotificationCategory[]
  fetchPostDetail?: boolean
  interval?: number
}

// ----- Internal types -----

interface InternalWatcher {
  stateKey: string
  groupIds: string[]
  categories: string[]
  fetchPostDetail: boolean
  seenIds: string[]
  handlers: Set<NotificationHandler>
}

interface PersistedState {
  watchers: Record<string, { seenIds: string[] }>
}

interface DiscordEmbedField {
  name: string
  value: string
  inline?: boolean
}

interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  timestamp?: string
  color?: number
  fields?: DiscordEmbedField[]
}

/**
 * Handle returned by {@link FansClient.watch}.
 * Use it to attach handlers, register a webhook, or stop watching.
 *
 * @example
 * ```ts
 * const w = client.watch({ groupCodes: ["nmixx"] })
 * w.onNotification((notif) => console.log(notif.message))
 * // later...
 * w.remove()
 * ```
 */
export interface WatcherHandle {
  /**
   * Register a callback that fires on each new notification.
   * Handlers are called in registration order, newest notification first.
   */
  onNotification(handler: NotificationHandler): void
  /**
   * Register an HTTP webhook URL.
   * A POST request with a JSON body is sent for each new notification.
   */
  onWebhook(url: string): void
  /** Stop this watcher — it will no longer receive notifications. */
  remove(): void
}

/**
 * Main client for the app.fans notification API.
 *
 * Handles authentication, token refresh, GraphQL requests,
 * notification polling, and per-watcher state persistence.
 *
 * @example
 * ```ts
 * const client = new FansClient({
 *   token: "eyJ...",
 *   clientUuid: "web-abc123",
 *   guid: "550e8400-...",
 * })
 *
 * const w = client.watch({ groupCodes: ["nmixx", "twice"] })
 * w.onNotification((n) => console.log(n.message))
 * ```
 */
export class FansClient {
  private auth: TokenManager
  private stateFile: string | null
  private watchers = new Map<string, InternalWatcher>()
  private nextWatcherId = 0

  /**
   * Create a client for the app.fans API.
   *
   * @param config.token - JWT token from localStorage key `j-access-token`
   * @param config.clientUuid - Client UUID from `mmkv.default\j-client-uuid`, prefixed with `"web-"`
   * @param config.guid - GUID from localStorage key `GUID`
   * @param config.stateFile - State file path, or `false` to disable persistence.
   */
  constructor(config: FansClientConfig) {
    this.auth = new TokenManager(config)
    this.stateFile =
      config.stateFile === false
        ? null
        : config.stateFile || path.resolve(process.cwd(), "fans_state.json")
  }

  // ----- Auth -----

  private async buildHeaders(): Promise<Record<string, string>> {
    const token = await this.auth.ensureFreshToken()
    return {
      ...DEFAULT_HEADERS,
      authorization: `Bearer ${token}`,
      "j-guid": this.auth.getGuid(),
      "content-type": "application/json",
    }
  }

  private async request(body: object): Promise<unknown> {
    const headers = await this.buildHeaders()

    const res = await fetch(API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    if (res.status === 401) {
      const newToken = await this.auth.refresh()
      headers.authorization = `Bearer ${newToken}`
      const retryRes = await fetch(API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
      if (!retryRes.ok) {
        const body = await retryRes.text().catch(() => "(unreadable)")
        throw new FansAuthError(
          `GraphQL request failed after token refresh (HTTP ${retryRes.status}): ${body}`,
        )
      }
      return retryRes.json()
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)")
      throw new FansError(`GraphQL request failed (HTTP ${res.status}): ${body}`)
    }

    return res.json()
  }

  // ----- Groups -----

  private validateGroupCode(code: string): GroupCode {
    const lowered = code.toLowerCase()
    if (lowered in GROUPS) return lowered as GroupCode

    for (const [key, group] of Object.entries(GROUPS)) {
      if (group.name.toLowerCase() === lowered) return key as GroupCode
    }

    throw new FansValidationError(
      `Unknown group "${code}". Available codes: ${Object.keys(GROUPS).join(", ")}`,
    )
  }

  private normalizeGroupIdentifiers(
    groupCodes?: GroupIdentifier | GroupIdentifier[],
  ): GroupIdentifier[] {
    return Array.isArray(groupCodes) ? groupCodes : groupCodes ? [groupCodes] : []
  }

  private isDiscordWebhookUrl(url: string): boolean {
    try {
      const parsed = new URL(url)
      return (
        (parsed.hostname === "discord.com" || parsed.hostname === "discordapp.com") &&
        parsed.pathname.startsWith("/api/webhooks/")
      )
    } catch {
      return false
    }
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength - 3)}...`
  }

  private buildDiscordWebhookPayload(notif: Notification): Record<string, unknown> {
    const groupName = notif.group?.name ?? "Unknown group"
    const title = notif.message ?? notif.category
    const postUrl = notif.linkUrl ? `https://app.fans${notif.linkUrl}` : undefined
    const description = notif.postDetail?.body
      ? this.truncate(notif.postDetail.body, 4000)
      : undefined
    const fields: DiscordEmbedField[] = [
      { name: "Category", value: notif.category, inline: true },
      { name: "Group", value: groupName, inline: true },
      { name: "Created At", value: notif.createdAt, inline: false },
    ]

    if (notif.linkUrl) {
      fields.push({
        name: "Link",
        value: postUrl ?? notif.linkUrl,
        inline: false,
      })
    }

    const embed: DiscordEmbed = {
      title: this.truncate(title, 256),
      url: postUrl,
      timestamp: notif.createdAt,
      color: 0x5865f2,
      fields,
    }

    if (description) {
      embed.description = description
    }

    const payload: Record<string, unknown> = {
      content: this.truncate(`[${groupName}] ${title}`, 2000),
      embeds: [embed],
    }

    return payload
  }

  private buildGenericWebhookPayload(notif: Notification): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      event: "notification",
      id: notif.id,
      category: notif.category,
      classification: notif.classification,
      message: notif.message,
      linkUrl: notif.linkUrl ? `https://app.fans/${notif.linkUrl}` : null,
      group: notif.group?.name ?? null,
      createdAt: notif.createdAt,
    }

    if (notif.postDetail) {
      payload.postDetail = notif.postDetail
    }

    return payload
  }

  // ----- Notifications -----

  /**
   * Fetch latest notifications from the API.
   * Community classification is hardcoded internally.
   *
   * @param filter - Filter by group codes and/or categories
   */
  async getNotifications(filter?: NotificationFilter): Promise<Notification[]> {
    const variables: Record<string, unknown> = {
      sort: [{ type: "UPDATED_AT", direction: "DESC" }],
      page: { first: 50 },
    }

    const queryFilter: Record<string, unknown> = {
      classification_Overlap: ["COMMUNITY"],
    }

    const codes = this.normalizeGroupIdentifiers(filter?.groupCodes)
    if (codes.length) {
      const ids = codes.map((code) => {
        const normalized = this.validateGroupCode(code)
        return GROUPS[normalized].id
      })
      queryFilter.group_Overlap = ids
    }

    if (filter?.categories?.length) {
      queryFilter.category_Overlap = filter.categories
    }

    if (Object.keys(queryFilter).length) {
      variables.filter = queryFilter
    }

    const result = (await this.request({
      operationName: "NotificationsForNotificationList",
      variables,
      query: `query NotificationsForNotificationList($filter: NotificationFilterInput, $sort: [NotificationSortInput], $page: PageInput) {
  notifications(filter: $filter, sort: $sort, page: $page) {
    objects {
      id
      category
      createdAt
      updatedAt
      message
      linkUrl
      classification
      group { id name code }
      globalShop { id name }
      targetMedia {
        key
        ... on Image { thumbnailUrl: thumbnailUrl(mode: THUMBNAIL, width: 300) }
        ... on Video { thumbnailUrl: thumbnailUrl(mode: THUMBNAIL, width: 300) }
      }
      actor { id }
    }
  }
}`,
    })) as {
      data?: { notifications?: { objects?: Notification[] } }
    }

    return result?.data?.notifications?.objects ?? []
  }

  // ----- Posts -----

  /**
   * Fetch full post content including body, body blocks, and media attachments.
   *
   * @param slug - The post slug (extracted from `Notification.linkUrl`, e.g. `"abc-123"`)
   */
  async getPostDetail(slug: string): Promise<PostDetail | null> {
    if (!slug) {
      throw new FansValidationError("slug is required")
    }

    const result = (await this.request({
      operationName: "CommunityPostDetail",
      variables: { filter: { slug_Exact: slug } },
      query: `query CommunityPostDetail($filter: PostFilterInput!) {
  post(filter: $filter) {
    id
    slug
    body
    likeCount
    commentCount
    firstActivatedAt
    member { nickname artist { code } }
    bodyBlocks {
      category
      text { content }
      sticker { imageUrl }
    }
    attachments {
      key
      url
      ... on Image {
        url
        thumbnailUrl: thumbnailUrl(mode: THUMBNAIL, width: 630)
      }
      ... on Video {
        url
        thumbnailUrl: thumbnailUrl(mode: THUMBNAIL, width: 630)
      }
    }
  }
}`,
    })) as {
      data?: { post?: PostDetail | null }
    }

    return result?.data?.post ?? null
  }

  // ----- Download helper -----

  // ----- Watchers -----

  private pollingInterval: number = 60
  private pollingTimer: ReturnType<typeof setTimeout> | null = null

  private scheduleNextCheck(): void {
    if (this.pollingTimer !== null) return
    this.pollingTimer = setTimeout(async () => {
      this.pollingTimer = null
      try {
        await this.check()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[fans] check error: ${msg}`)
      }
      if (this.watchers.size > 0) {
        this.scheduleNextCheck()
      }
    }, this.pollingInterval * 1000)
  }

  /**
   * Create a new notification watcher.
   *
   * Each watcher has its own filter, its own set of registered handlers,
   * and its own seen-ID state (persisted to the state file).
   *
   * All watchers share a single API call per check cycle —
   * notifications are fetched once and then filtered per watcher.
   *
   * Polling starts automatically and stops when the last watcher is removed.
   *
   * @param config.id - Stable key for persisted seen IDs. Derived from filters when omitted.
   * @param config.groupCodes - One or more group codes to watch (empty = all groups)
   * @param config.categories - Only watch these notification categories (empty = all categories)
   * @param config.fetchPostDetail - If true, automatically fetch full post detail for artist posts
   * @param config.interval - Polling interval in seconds (default: 60)
   *
   * @returns A handle to attach handlers or remove the watcher
   */
  watch(config: WatchConfig): WatcherHandle {
    const name = `watcher-${++this.nextWatcherId}`

    if (config.interval) {
      this.pollingInterval = config.interval
    }

    const codes = this.normalizeGroupIdentifiers(config.groupCodes)
    const groupIds = codes.map((code) => {
      const normalized = this.validateGroupCode(code)
      return GROUPS[normalized].id
    })

    const categories = config.categories ?? []
    const stateKey = config.id ?? this.buildWatcherStateKey(groupIds, categories)
    const persisted = this.loadPersistedState()

    this.watchers.set(name, {
      stateKey,
      groupIds,
      categories,
      fetchPostDetail: config.fetchPostDetail ?? false,
      seenIds: persisted.watchers[stateKey]?.seenIds ?? persisted.watchers[name]?.seenIds ?? [],
      handlers: new Set(),
    })

    this.scheduleNextCheck()

    return {
      onNotification: (handler: NotificationHandler) => {
        this.watchers.get(name)?.handlers.add(handler)
      },
      onWebhook: (url: string) => {
        this.watchers.get(name)?.handlers.add(async (notif: Notification) => {
          try {
            const payload = this.isDiscordWebhookUrl(url)
              ? this.buildDiscordWebhookPayload(notif)
              : this.buildGenericWebhookPayload(notif)
            await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error(`[fans] webhook failed: ${msg}`)
          }
        })
      },
      remove: () => {
        this.watchers.delete(name)
        if (this.watchers.size === 0 && this.pollingTimer !== null) {
          clearTimeout(this.pollingTimer)
          this.pollingTimer = null
        }
      },
    }
  }

  private loadPersistedState(): PersistedState {
    if (!this.stateFile) return { watchers: {} }

    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = fs.readFileSync(this.stateFile, "utf-8")
        return JSON.parse(raw) as PersistedState
      }
    } catch {
      // ignore
    }
    return { watchers: {} }
  }

  private persistState(): void {
    if (!this.stateFile) return

    const state: PersistedState = { watchers: {} }
    for (const ws of this.watchers.values()) {
      state.watchers[ws.stateKey] = { seenIds: ws.seenIds }
    }
    const dir = path.dirname(this.stateFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), "utf-8")
  }

  private buildWatcherStateKey(groupIds: string[], categories: string[]): string {
    const groupsPart = groupIds.length ? groupIds.slice().sort().join(",") : "all"
    const categoriesPart = categories.length ? categories.slice().sort().join(",") : "all"
    return `groups:${groupsPart}|categories:${categoriesPart}`
  }

  private async fetchNotificationsForWatchers(): Promise<Notification[]> {
    return this.getNotifications({})
  }

  /**
   * Perform a single check cycle:
   * 1. Fetch all new notifications (single API call)
   * 2. Filter per watcher by group/category
   * 3. Track seen IDs to avoid duplicates
   * 4. Optionally fetch post detail for artist posts
   * 5. Call all registered handlers (newest first)
   * 6. Persist state
   *
   * @returns A map of watcher name → new notifications for that watcher
   */
  private async check(): Promise<Map<string, Notification[]>> {
    if (this.watchers.size === 0) return new Map()

    const allNotifications = await this.fetchNotificationsForWatchers()
    const results = new Map<string, Notification[]>()

    for (const [name, w] of this.watchers) {
      const catSet = w.categories.length ? new Set(w.categories) : null
      const groupSet = w.groupIds.length ? new Set(w.groupIds) : null

      const filtered = allNotifications.filter((n) => {
        if (catSet && !catSet.has(n.category)) return false
        if (groupSet && !(n.group && groupSet.has(n.group.id))) return false
        return true
      })

      const known = new Set(w.seenIds)
      const allIds: string[] = []
      const newItems: Notification[] = []

      for (const notif of filtered) {
        allIds.push(notif.id)
        if (known.size > 0 && !known.has(notif.id)) {
          newItems.push(notif)
        }
      }

      // Fetch post detail for new artist posts
      for (const item of newItems) {
        if (w.fetchPostDetail && item.category === "POST_CREATED_BY_ARTIST") {
          const slug = item.linkUrl?.split("/").pop()
          if (slug) {
            try {
              item.postDetail = await this.getPostDetail(slug)
            } catch {
              // ignore
            }
          }
        }
      }

      // Call handlers (newest first)
      for (const item of newItems.slice().reverse()) {
        for (const handler of w.handlers) {
          try {
            await handler(item)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error(`[fans] handler error: ${msg}`)
          }
        }
      }

      w.seenIds = allIds
      results.set(name, newItems)
    }

    this.persistState()
    return results
  }
}

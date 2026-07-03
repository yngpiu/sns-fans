/** Base URL for all GraphQL API requests */
export const API_URL = "https://api.app.fans/graphql"
/** Endpoint for refreshing the JWT access token */
export const REFRESH_URL = "https://api.app.fans/account/auth/refresh"

/**
 * All available JYP artists/groups on app.fans.
 * Keyed by unique short code, each entry contains the internal `id` and display `name`.
 */
export const GROUPS = {
  nmixx: { id: "14", name: "NMIXX" },
  twice: { id: "9", name: "TWICE" },
  itzy: { id: "11", name: "ITZY" },
  girlset: { id: "15", name: "GIRLSET" },
  day6: { id: "8", name: "DAY6" },
  twopm: { id: "3", name: "2PM" },
  straykids: { id: "10", name: "Stray Kids" },
  jypark: { id: "2", name: "J.Y. Park" },
  jangwooyoung: { id: "6", name: "JANG WOOYOUNG" },
  niziu: { id: "12", name: "NiziU" },
  xdinaryheroes: { id: "13", name: "Xdinary Heroes" },
  kickflip: { id: "67", name: "KickFlip" },
  nexz: { id: "34", name: "NEXZ" },
  parkyoonho: { id: "133", name: "PARK YOONHO" },
  nichkhun: { id: "5", name: "NICHKHUN" },
  junk: { id: "4", name: "JUN. K" },
  dodree: { id: "134", name: "dodree" },
} as const

/** Short code identifying a group/artist (e.g. `"nmixx"`, `"twice"`) */
export type GroupCode = keyof typeof GROUPS

/** Display name of a group/artist (e.g. `"NMIXX"`, `"TWICE"`) */
export type GroupName = (typeof GROUPS)[GroupCode]["name"]

/** Accepts both lowercase codes and display names (e.g. `"nmixx"` or `"NMIXX"`) */
export type GroupIdentifier = GroupCode | GroupName

/**
 * Known notification category values.
 * Used in {@link NotificationFilter.categories} to filter watchers.
 *
 * @example
 * ```ts
 * watcher.categories = [NOTIFICATION_CATEGORIES.POST_CREATED_BY_ARTIST]
 * ```
 */
export const NOTIFICATION_CATEGORIES = {
  POST_CREATED_BY_ARTIST: "POST_CREATED_BY_ARTIST",
  CLIP_ACTIVATED: "CLIP_ACTIVATED",
  NOTICE_ACTIVATED: "NOTICE_ACTIVATED",
  POST_LIKE_CREATED_BY_ARTIST: "POST_LIKE_CREATED_BY_ARTIST",
  COMMENT_CREATED_BY_ARTIST: "COMMENT_CREATED_BY_ARTIST",
  COMMENT_LIKE_CREATED_BY_ARTIST: "COMMENT_LIKE_CREATED_BY_ARTIST",
} as const

/** One of the known notification category keys (e.g. `"POST_CREATED_BY_ARTIST"`) */
export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES

export const DEFAULT_HEADERS: Record<string, string> = {
  "j-operation-type": "query",
  "j-context": "web",
  "j-client-version": "2.2627.1",
  "j-language": "en",
  "j-marketplace": "KR",
  "j-currency": "USD",
  "j-timezone": "Asia/Saigon",
  origin: "https://app.fans",
  referer: "https://app.fans/",
}

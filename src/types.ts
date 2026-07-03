/**
 * Credentials required to authenticate with the app.fans API.
 * Obtain these from browser localStorage:
 * - `token` → `j-access-token`
 * - `clientUuid` → `mmkv.default\j-client-uuid` (prefix with `"web-"`)
 * - `guid` → `GUID`
 */
export interface TokenConfig {
  /** JWT access token from localStorage key `j-access-token` */
  token: string
  /** Client UUID from `mmkv.default\j-client-uuid`, prefixed with `"web-"` */
  clientUuid: string
  /** GUID from localStorage key `GUID` */
  guid: string
}

/**
 * An artist/group as returned by the GraphQL API.
 * Contains metadata like status, premium tier, and display images.
 */
export interface Group {
  /** Internal numeric ID */
  id: string
  /** Short code (e.g. `"nmixx"`, `"twice"`) */
  code: string
  /** Display name */
  name: string
  /** Group status (e.g. `"ACTIVE"`) */
  status?: string
  /** Current premium subscription tier, if any */
  activePremium?: { id: string; name: string; code: string } | null
  /** Viewer's membership info */
  _member?: Member | null
  /** Grid/card image shown in the group list */
  mainGridImage?: Image | null
  /** Logo image */
  mainLogoImage?: Image | null
}

/** Membership info for the authenticated user within a group. */
export interface Member {
  id: string
  /** Display nickname within the group */
  nickname?: string | null
  /** URL slug for the member's profile */
  slug?: string | null
  /** Membership status */
  status?: string | null
  /** If suspended, the suspension category */
  suspensionCategory?: string | null
  /** Profile picture */
  profileImage?: Image | null
  /** Role categories (e.g. `["MEMBER"]`) */
  roleCategories?: string[]
  /** Associated artist, if the member is an artist */
  artist?: { id: string } | null
}

/** An image resource with optional thumbnail. */
export interface Image {
  /** S3 key (also used as fallback URL via `https://img.app.fans/{key}`) */
  key: string
  /** Direct URL */
  url?: string | null
  /** Thumbnail URL (smaller resolution) */
  thumbnailUrl?: string | null
  /** Original image width */
  width?: number | null
  /** Original image height */
  height?: number | null
}

/**
 * A notification from app.fans.
 * Maps to the `NotificationsForNotificationList` GraphQL query.
 */
export interface Notification {
  /** Unique notification ID */
  id: string
  /** Category string (e.g. `"POST_CREATED_BY_ARTIST"`, `"CLIP_ACTIVATED"`) */
  category: string
  /** Classification (always `"COMMUNITY"` for current scope) */
  classification: string
  /** ISO-8601 creation timestamp */
  createdAt: string
  /** ISO-8601 last-updated timestamp */
  updatedAt: string
  /** Human-readable notification message */
  message?: string | null
  /** Relative URL path (e.g. `/post/abc-123`); append to `https://app.fans` */
  linkUrl?: string | null
  /** The group that triggered this notification */
  group?: { id: string; name: string; code: string } | null
  /** Associated global shop */
  globalShop?: { id: string; name: string } | null
  /** Preview image attached to the notification */
  targetMedia?: Image | null
  /** The user who triggered the notification */
  actor?: { id: string } | null
  /**
   * Full post detail, populated automatically when
   * `fetchPostDetail: true` is set on the watcher config.
   */
  postDetail?: PostDetail | null
}

/**
 * Full content of a community post, fetched via the `CommunityPostDetail` GraphQL query.
 * Use {@link FansClient.getPostDetail} to fetch manually.
 */
export interface PostDetail {
  /** Internal post ID */
  id: string
  /** URL slug (passed to `getPostDetail(slug)`) */
  slug: string
  /** Plain-text body */
  body?: string | null
  /** Number of likes */
  likeCount: number
  /** Number of comments */
  commentCount: number
  /** ISO-8601 timestamp of first activation */
  firstActivatedAt?: string | null
  /** Author info */
  member?: {
    /** Author's display nickname */
    nickname?: string | null
    /** Author's artist group code */
    artist?: { code?: string } | null
  } | null
  /** Rich content blocks (text, stickers, etc.) */
  bodyBlocks?: BodyBlock[] | null
  /** Media attachments (images, videos, audio) */
  attachments?: Attachment[] | null
}

/** A single rich-content block within a post body. */
export interface BodyBlock {
  /** Block type (`"TEXT"`, `"STICKER"`, etc.) */
  category: string
  /** Text content for `"TEXT"` blocks */
  text?: { content: string } | null
  /** Image URL for `"STICKER"` blocks */
  sticker?: { imageUrl: string } | null
}

/** A media attachment (image, video, or audio) on a post. */
export interface Attachment {
  /** S3 key */
  key: string
  /** Direct media URL */
  url?: string | null
  /** Thumbnail URL (images/videos) */
  thumbnailUrl?: string | null
  /** GraphQL type discriminator (e.g. `"Image"`, `"Video"`, `"Audio"`) */
  __typename?: string | null
}

import type { GroupIdentifier, NotificationCategory } from "./constants.js"

/**
 * Filter passed to {@link FansClient.getNotifications}.
 * Narrow down results by group and/or category.
 */
export interface NotificationFilter {
  /** Only include notifications from these groups. Accepts code (lowercase) or display name. */
  groupCodes?: GroupIdentifier[]
  /** Only include notifications with these category values */
  categories?: NotificationCategory[]
}

/**
 * Callback invoked when a new notification is received.
 * Can be synchronous or return a Promise.
 */
export type NotificationHandler = (notification: Notification) => void | Promise<void>

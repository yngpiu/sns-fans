# sns-fans

[![npm](https://img.shields.io/npm/v/sns-fans)](https://www.npmjs.com/package/sns-fans)
[![npm](https://img.shields.io/npm/dm/sns-fans)](https://www.npmjs.com/package/sns-fans)
[![npm](https://img.shields.io/npm/l/sns-fans)](https://github.com/yngpiu/sns-fans/blob/master/LICENSE)
[![CI](https://github.com/yngpiu/sns-fans/actions/workflows/ci.yml/badge.svg)](https://github.com/yngpiu/sns-fans/actions/workflows/ci.yml)

Unofficial Node.js client for the app.fans GraphQL API.
Monitor artist notifications, fetch posts, and get notified in real-time via polling.

---

# Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Concepts](#concepts)
  - [FansClient](#fansclient)
  - [WatcherHandle](#watcherhandle)
- [API](#api)
  - [Constructor](#constructor)
  - [watch()](#watchconfig--create-a-watcher-auto-polling)
  - [getNotifications()](#getnotificationsfilter--manual-fetch)
  - [getPostDetail()](#getpostdetailslug--fetch-post-content)
  - [GROUPS](#groups)
  - [NOTIFICATION_CATEGORIES](#notification_categories)
- [Errors](#errors)
- [License](#license)

---

# Install

```sh
npm install sns-fans
```

Requires Node.js >= 18.

---

# Quick Start

```typescript
import { FansClient, NOTIFICATION_CATEGORIES } from "sns-fans"

const client = new FansClient({
  token: "eyJ...",
  clientUuid: "web-xxx...",
  guid: "xxx...",
})

// Auto-polling for new notifications
const w = client.watch({
  groupCodes: ["NMIXX", "TWICE"],
  categories: [NOTIFICATION_CATEGORIES.POST_CREATED_BY_ARTIST],
})

w.onNotification((notif) => {
  console.log(`[${notif.group?.name}] ${notif.message}`)
  if (notif.postDetail) {
    console.log("Post body:", notif.postDetail.body)
  }
})
```

Full examples can be found [here](examples/quickstart.ts). The example reads credentials from `FANS_TOKEN`, `FANS_CLIENT_UUID`, and `FANS_GUID`.

---

# Concepts

## FansClient

The root class. Holds authentication state for one user and provides all API methods.

```typescript
const client = new FansClient({ token, clientUuid, guid })
```

- `token` — JWT access token from localStorage key `j-access-token`
- `clientUuid` — from localStorage (key `mmkv.default\j-client-uuid`), prepend `"web-"`
- `guid` — from localStorage key `GUID`

If you can't find `j-client-uuid` in localStorage, open the **Network** tab in DevTools, find any `graphql` request, and copy the `x-client-uuid` request header value.

## WatcherHandle

Returned by `client.watch()`. Controls a single watcher lifecycle.

```typescript
const w = client.watch({ groupCodes: "NMIXX" })

w.onNotification((notif) => { /* handle new notification */ })
w.onWebhook("https://example.com/hook")  // POST JSON on each notification
w.remove()  // stop this watcher (polling stops if no watchers remain)
```

---

# API

## Constructor

```typescript
const client = new FansClient({
  token: "eyJ...",           // required
  clientUuid: "web-xxx...",  // required
  guid: "xxx...",            // required
  stateFile: "./state.json", // optional, defaults to ./fans_state.json
  // stateFile: false,       // disable persistence
})
```

`stateFile` persists seen notification IDs across restarts so old notifications are not re-delivered. Omit it to use `./fans_state.json`, or set `stateFile: false` to disable file persistence.

## watch(config) — Create a watcher (auto-polling)

```typescript
const w = client.watch({
  id: "nmixx-twice-posts",           // optional stable persistence key
  groupCodes: ["nmixx", "twice"],  // groups to monitor
  categories: undefined,           // undefined = all categories
  fetchPostDetail: true,           // auto-fetch post content
  interval: 60,                    // polling interval in seconds
})
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | derived from filters | Stable key for persisted seen IDs |
| `groupCodes` | `string \| string[]` | all groups | Group code or display name. Accepts `"nmixx"` or `"NMIXX"` |
| `categories` | `NotificationCategory[]` | all | Filter by category, e.g. `[NOTIFICATION_CATEGORIES.POST_CREATED_BY_ARTIST]` |
| `fetchPostDetail` | `boolean` | `false` | If `true`, auto-fetches post body for `POST_CREATED_BY_ARTIST` notifications |
| `interval` | `number` | `60` | Seconds between API checks |

**Returns:** [`WatcherHandle`](#watcherhandle)

### w.onNotification(handler)

```typescript
w.onNotification((notif) => {
  console.log(notif.message)          // "NMIXX posted a new post."
  console.log(notif.category)         // "POST_CREATED_BY_ARTIST"
  console.log(notif.group?.name)      // "NMIXX"
  console.log(notif.createdAt)        // ISO-8601 timestamp
  console.log(notif.linkUrl)          // "/post/abc-123"
  if (notif.postDetail) {
    console.log(notif.postDetail.body)         // full text
    console.log(notif.postDetail.attachments)  // images/videos/audio
  }
})
```

### w.onWebhook(url)

POSTs a JSON payload to the URL on each new notification.

```typescript
w.onWebhook("https://example.com/fans-notification")
```

Payload:

```json
{
  "event": "notification",
  "id": "12345",
  "category": "POST_CREATED_BY_ARTIST",
  "message": "NMIXX posted a new post.",
  "linkUrl": "https://app.fans/post/abc-123",
  "group": "NMIXX",
  "createdAt": "2026-07-03T12:00:00Z"
}
```

### w.remove()

Stops the watcher. Polling stops automatically if no watchers remain.

## getNotifications(filter?) — Manual fetch

```typescript
const notifs = await client.getNotifications({
  groupCodes: ["nmixx"],
  categories: [NOTIFICATION_CATEGORIES.POST_CREATED_BY_ARTIST],
})
```

Returns `Notification[]`, newest first. Same filter shape as `watch()`.

## getPostDetail(slug) — Fetch post content

```typescript
const slug = notif.linkUrl?.split("/").pop()
const post = await client.getPostDetail(slug)
if (post) {
  console.log(post.body)                    // text
  console.log(post.bodyBlocks)              // TEXT + STICKER blocks
  console.log(post.attachments)             // Image | Video | Audio
}
```

Each attachment has `key` and `url`. If `url` is null, use `https://img.app.fans/{key}`.

## GROUPS

```typescript
import { GROUPS } from "sns-fans"
GROUPS.nmixx  // { id: "14", name: "NMIXX" }
GROUPS.twice  // { id: "9", name: "TWICE" }
```

17 groups: nmixx, twice, itzy, girlset, day6, twopm, straykids, jypark, jangwooyoung, niziu, xdinaryheroes, kickflip, nexz, parkyoonho, nichkhun, junk, dodree.

## NOTIFICATION_CATEGORIES

```typescript
import { NOTIFICATION_CATEGORIES } from "sns-fans"
```

| Constant | Description |
|---|---|
| `POST_CREATED_BY_ARTIST` | Artist posted a new post |
| `CLIP_ACTIVATED` | New clip available |
| `NOTICE_ACTIVATED` | Official notice published |
| `POST_LIKE_CREATED_BY_ARTIST` | Artist liked a post |
| `COMMENT_CREATED_BY_ARTIST` | Artist commented |
| `COMMENT_LIKE_CREATED_BY_ARTIST` | Artist liked a comment |

---

# Errors

```typescript
import { FansError, FansAuthError, FansValidationError } from "sns-fans"
```

- **`FansAuthError`** — Token expired or refresh failed. Obtain a new token from browser localStorage.
- **`FansValidationError`** — Invalid group code, empty slug, etc.
- **`FansError`** — General errors (API error, network error, etc.)

---

# License

MIT

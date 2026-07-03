# sns-fans

```sh
npm install sns-fans
```

## Quick start

```ts
import { FansClient } from "sns-fans"

const client = new FansClient({
  token: "eyJ...",
  clientUuid: "web-xxx...",
  guid: "xxx...",
})

const w = client.watch({ groupCodes: ["nmixx", "twice"] })
w.onNotification((n) => console.log(`[${n.group?.name}] ${n.message}`))
```

## `FansClient`

Main class. Import from `sns-fans`.

### `constructor(config)`

```ts
const client = new FansClient({
  token: "eyJ...",           // required
  clientUuid: "web-xxx...",  // required
  guid: "xxx...",            // required
  stateFile: "./state.json", // optional, defaults to ./fans_state.json
})
```

3 required parameters from app.fans browser localStorage:
- `j-access-token` → `token`
- `mmkv.default\j-client-uuid` → prepend `"web-"` → `clientUuid`
- `GUID` → `guid`

`stateFile` is a JSON file where the client persists seen notification IDs across restarts, so old notifications are not re-delivered. Omit to skip file persistence.

### `watch(config)` — Create a watcher (auto-polling)

Primary function. Use when you want background polling for new notifications.

```ts
const w = client.watch({
  groupCodes: ["nmixx", "twice"],  // which groups to monitor
  categories: undefined,           // undefined = all categories
  fetchPostDetail: true,           // whether to fetch post content
  interval: 60,                    // polling interval in seconds
})
```

Filters:

- **`groupCodes`** — Only receive notifications from these groups. Accepts a string (`"nmixx"`) or array (`["nmixx", "twice"]`). Default: all groups.
- **`categories`** — Only receive notifications of these types. E.g. `[NOTIFICATION_CATEGORIES.POST_CREATED_BY_ARTIST]`. Default: all.
- **`fetchPostDetail`** — If `true`, for `POST_CREATED_BY_ARTIST` notifications the client automatically calls `getPostDetail()` and attaches the result to `Notification.postDetail`. If `false`, `postDetail` is `null`.
- **`interval`** — Seconds between API checks. Default: 60.

Calling `watch()` starts polling automatically. Calling `w.remove()` stops polling if no other watchers remain.

`watch()` returns a **`WatcherHandle`** with 3 methods:

#### `w.onNotification(handler)` — Receive notifications

```ts
w.onNotification((notif) => {
  console.log(notif.message)          // notification text
  console.log(notif.category)         // "POST_CREATED_BY_ARTIST", ...
  console.log(notif.group?.name)      // "NMIXX", "TWICE", ...
  console.log(notif.createdAt)        // timestamp
  console.log(notif.linkUrl)          // post URL path
  if (notif.postDetail) {
    console.log(notif.postDetail.body) // post body text
    console.log(notif.postDetail.attachments) // images/videos
  }
})
```

Handler fires for each new notification (not seen in previous checks). Newest first.

#### `w.onWebhook(url)` — Send webhook

```ts
w.onWebhook("https://example.com/fans-notification")
```

Each new notification triggers a POST JSON request to the URL. Sample payload:

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

#### `w.remove()` — Remove watcher

```ts
w.remove()
```

Removes this watcher. Polling stops automatically if no watchers remain.

### `getNotifications(filter?)` — Manual fetch

Use when you don't need a watcher, just want to fetch notifications once.

```ts
const notifs = await client.getNotifications({
  groupCodes: ["nmixx"],
  categories: [NOTIFICATION_CATEGORIES.POST_CREATED_BY_ARTIST],
})
// notifs is Notification[], newest first
```

Same filter shape as `watch()`.

### `getPostDetail(slug)` — Fetch post content

Use when you have a `Notification.linkUrl` (e.g. `/post/abc-123`) and want full content.

```ts
const slug = notif.linkUrl?.split("/").pop() // "abc-123"
const post = await client.getPostDetail(slug)
if (post) {
  console.log(post.body)                    // text
  console.log(post.bodyBlocks)              // text blocks + stickers
  console.log(post.attachments)             // images/videos
}
```

Each attachment has `key` and `url`. If `url` is null, use `https://img.app.fans/{key}`.

## `GROUPS`

Use to discover available group codes.

```ts
import { GROUPS } from "sns-fans"
GROUPS.nmixx  // { id: "14", name: "NMIXX" }
GROUPS.twice  // { id: "9", name: "TWICE" }
```

17 groups available: nmixx, twice, itzy, girlset, day6, twopm, straykids, jypark, jangwooyoung, niziu, xdinaryheroes, kickflip, nexz, parkyoonho, nichkhun, junk, dodree.

## `NOTIFICATION_CATEGORIES`

Use to filter categories in `watch()` and `getNotifications()`.

```ts
import { NOTIFICATION_CATEGORIES } from "sns-fans"
```

| Constant | Meaning |
|---|---|
| `POST_CREATED_BY_ARTIST` | Artist posted a new post |
| `CLIP_ACTIVATED` | Clip activated |
| `NOTICE_ACTIVATED` | Official notice |
| `POST_LIKE_CREATED_BY_ARTIST` | Artist liked a post |
| `COMMENT_CREATED_BY_ARTIST` | Artist commented |
| `COMMENT_LIKE_CREATED_BY_ARTIST` | Artist liked a comment |

## Errors

```ts
import { FansAuthError, FansValidationError, FansError } from "sns-fans"
```

- `FansAuthError` — Token expired or refresh failed. Obtain a new token from the browser.
- `FansValidationError` — Invalid group code, empty slug, etc.
- `FansError` — General errors (API error, network error, etc.)

## License MIT

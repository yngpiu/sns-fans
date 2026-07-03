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

Class chính. Import từ `sns-fans`.

### `constructor(config)` — Khởi tạo client

```ts
const client = new FansClient({
  token: "eyJ...",           // bắt buộc
  clientUuid: "web-xxx...",  // bắt buộc
  guid: "xxx...",            // bắt buộc
  stateFile: "./state.json", // không bắt buộc, mặc định ./fans_state.json
})
```

3 tham số bắt buộc lấy từ localStorage của app.fans trên trình duyệt:
- `j-access-token` → `token`
- `mmkv.default\j-client-uuid` → thêm `"web-"` ở đầu → `clientUuid`
- `GUID` → `guid`

`stateFile` là file JSON client tự động lưu các ID đã xem, để lần sau không gửi lại notification cũ. Nếu không muốn dùng file thì bỏ qua.

### `watch(config)` — Tạo watcher + tự động polling

Đây là hàm chính. Dùng khi bạn muốn chạy nền, nhận notification mới tự động.

```ts
const w = client.watch({
  groupCodes: ["nmixx", "twice"],  // lọc group nào
  categories: undefined,           // undefined = tất cả categories
  fetchPostDetail: true,           // có fetch nội dung post không
  interval: 60,                    // bao lâu check 1 lần (giây)
})
```

Các filter:

- **`groupCodes`** — Chỉ nhận notification của nhóm này. Nhận string (`"nmixx"`) hoặc array (`["nmixx", "twice"]`). Mặc định: tất cả groups.
- **`categories`** — Chỉ nhận notification loại này. VD: `[NOTIFICATION_CATEGORIES.POST_CREATED_BY_ARTIST]`. Mặc định: tất cả.
- **`fetchPostDetail`** — Nếu `true`, với notification loại `POST_CREATED_BY_ARTIST`, client tự động gọi `getPostDetail()` và gắn kết quả vào `Notification.postDetail`. Nếu `false`, `postDetail` là `null`.
- **`interval`** — Số giây giữa 2 lần check API. Mặc định: 60.

Khi gọi `watch()`, polling tự động bắt đầu. Khi gọi `w.remove()`, polling tự động dừng nếu không còn watcher nào.

`watch()` trả về **`WatcherHandle`**, có 3 method:

#### `w.onNotification(handler)` — Nhận notification

```ts
w.onNotification((notif) => {
  console.log(notif.message)          // nội dung thông báo
  console.log(notif.category)         // "POST_CREATED_BY_ARTIST", ...
  console.log(notif.group?.name)      // "NMIXX", "TWICE", ...
  console.log(notif.createdAt)        // thời gian
  console.log(notif.linkUrl)          // đường dẫn bài viết
  if (notif.postDetail) {
    console.log(notif.postDetail.body) // nội dung bài viết
    console.log(notif.postDetail.attachments) // ảnh/video
  }
})
```

Handler được gọi khi có notification mới (chưa từng thấy trong các lần check trước). Thứ tự: newest trước.

#### `w.onWebhook(url)` — Gửi webhook

```ts
w.onWebhook("https://example.com/fans-notification")
```

Mỗi khi có notification mới, client POST JSON đến URL đó. Payload mẫu:

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

#### `w.remove()` — Xoá watcher

```ts
w.remove()
```

Xoá watcher này. Nếu không còn watcher nào, polling tự động dừng.

### `getNotifications(filter?)` — Fetch thủ công

Dùng khi bạn không cần watcher, chỉ muốn lấy danh sách notification một lần.

```ts
const notifs = await client.getNotifications({
  groupCodes: ["nmixx"],
  categories: [NOTIFICATION_CATEGORIES.POST_CREATED_BY_ARTIST],
})
// notifs là Notification[], mới nhất trước
```

Cùng filter shape với `watch()`.

### `getPostDetail(slug)` — Fetch nội dung bài viết

Dùng khi bạn có `Notification.linkUrl` (VD: `/post/abc-123`) và muốn đọc nội dung đầy đủ.

```ts
const slug = notif.linkUrl?.split("/").pop() // "abc-123"
const post = await client.getPostDetail(slug)
if (post) {
  console.log(post.body)                    // text
  console.log(post.bodyBlocks)              // text blocks + sticker
  console.log(post.attachments)             // ảnh/video
}
```

Mỗi attachment có `key` và `url`. Nếu `url` null thì dùng `https://img.app.fans/{key}`.

## `GROUPS`

Dùng để biết group code nào có sẵn.

```ts
import { GROUPS } from "sns-fans"
GROUPS.nmixx  // { id: "14", name: "NMIXX" }
GROUPS.twice  // { id: "9", name: "TWICE" }
```

Có 17 groups: nmixx, twice, itzy, girlset, day6, twopm, straykids, jypark, jangwooyoung, niziu, xdinaryheroes, kickflip, nexz, parkyoonho, nichkhun, junk, dodree.

## `NOTIFICATION_CATEGORIES`

Dùng để lọc category trong `watch()` và `getNotifications()`.

```ts
import { NOTIFICATION_CATEGORIES } from "sns-fans"
```

| Constant | Ý nghĩa |
|---|---|
| `POST_CREATED_BY_ARTIST` | Artist đăng bài viết mới |
| `CLIP_ACTIVATED` | Clip được kích hoạt |
| `NOTICE_ACTIVATED` | Thông báo chính thức |
| `POST_LIKE_CREATED_BY_ARTIST` | Artist like bài viết |
| `COMMENT_CREATED_BY_ARTIST` | Artist comment |
| `COMMENT_LIKE_CREATED_BY_ARTIST` | Artist like comment |

## Errors

```ts
import { FansAuthError, FansValidationError, FansError } from "sns-fans"
```

- `FansAuthError` — Token hết hạn, refresh token thất bại. Cần lấy token mới từ trình duyệt.
- `FansValidationError` — Group code sai, slug rỗng, ...
- `FansError` — Lỗi chung (API lỗi, network lỗi, ...)

## License MIT

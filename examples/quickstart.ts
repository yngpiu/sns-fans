import { FansClient, NOTIFICATION_CATEGORIES } from "../dist/index.js"

// Replace with your values from browser DevTools > Application > Local Storage.
// Never commit real tokens or user identifiers.
const TOKEN = ''
const CLIENT_UUID = ''
const GUID = ''

if (!TOKEN || !CLIENT_UUID || !GUID) {
  throw new Error("Set FANS_TOKEN, FANS_CLIENT_UUID, and FANS_GUID before running this example")
}

async function main() {
  const client = new FansClient({
    token: TOKEN,
    clientUuid: CLIENT_UUID,
    guid: GUID,
  })

  // ---- Method 1: watch() auto-polling ----
  console.log("Watching NMIXX + TWICE artist posts...")

  const w = client.watch({
    id: "nmixx-twice-artist-posts",
    groupCodes: ["NMIXX", "TWICE"],
    categories: [NOTIFICATION_CATEGORIES.POST_CREATED_BY_ARTIST],
    fetchPostDetail: true,
    interval: 30,
  })

  w.onNotification((notif) => {
    console.log(`[${notif.group?.name}] ${notif.message}`)
    if (notif.postDetail) {
      console.log("Post body:", notif.postDetail.body?.substring(0, 200))
      console.log("Attachments:", notif.postDetail.attachments?.length)
    }
  })

  // Webhook: sends POST JSON to URL on each new notification.
  w.onWebhook("https://example.com/fans-webhook")

  // Remove watcher after 5 minutes; polling stops automatically.
  setTimeout(() => {
    w.remove()
    console.log("Stopped watching")
  }, 300_000)

  // ---- Method 2: manual getNotifications() ----
  const notifs = await client.getNotifications({
    groupCodes: ["NMIXX"],
    categories: [NOTIFICATION_CATEGORIES.POST_CREATED_BY_ARTIST],
  })

  if (notifs.length > 0) {
    const slug = notifs[0].linkUrl?.split("/").pop()
    if (slug) {
      const post = await client.getPostDetail(slug)
      console.log("=== Latest post ===")
      console.log("ID:", post?.id)
      console.log("Body:", post?.body)
      console.log("Like count:", post?.likeCount)
      console.log("Comment count:", post?.commentCount)
      console.log("Attachments:", JSON.stringify(post?.attachments, null, 2))
      console.log("Body blocks:", JSON.stringify(post?.bodyBlocks, null, 2))
    }
  }
}

main().catch(console.error)

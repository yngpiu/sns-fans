import { FansClient, NOTIFICATION_CATEGORIES } from "../src/index.js"

// ⚠️ Replace with your values from browser DevTools > Application > Local Storage
const TOKEN = "eyJ..."
const CLIENT_UUID = "web-..."
const GUID = "a467fdc9-..."

async function main() {
  const client = new FansClient({
    token: TOKEN,
    clientUuid: CLIENT_UUID,
    guid: GUID,
  })

  // ---- Method 1: watch() — auto-polling ----
  console.log("Watching NMIXX + TWICE artist posts...")

  const w = client.watch({
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

  // Webhook: sends POST JSON to URL on each new notification
  // Useful for integrating with Discord, Telegram, Slack, etc.
  w.onWebhook("https://example.com/fans-webhook")

  // Remove watcher after 5 minutes (polling stops automatically)
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
      console.log("Latest post:", post?.body?.substring(0, 100))
    }
  }
}

main().catch(console.error)

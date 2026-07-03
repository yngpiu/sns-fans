import { FansClient, NOTIFICATION_CATEGORIES } from "../dist/index.js"

// ⚠️ Replace with your values from browser DevTools > Application > Local Storage
const TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJqeXAiLCJzdWIiOiI5OTg0NDYiLCJhdWQiOiJubWl4eCIsImV4cCI6MTc4MzE3NjQzOCwiaWF0IjoxNzgzMDkwMDM4LjQxMTkwNSwic2lkIjoiNDgzNzU1ODUiLCJsbmciOiJlbiIsInBobyI6dHJ1ZSwibWJnIjoiMTQ6MTQxNTY1MiA5OjE0MTc4NjEgMTE6MTQyMzcxNSAxNToxNDgyNDkwIiwidWN1Ijoid2ViLWRiM2QyMTJiLWFmYzAtNDllOC1iMzIxLWVhN2NlNDg5MjU5MSIsInNjb3BlIjoiYXBwIn0.WYv6pEIgtUNcvPZ8dStOMG9nxeYiTTknRqWOg3tK7NIYLjgrsi9W32LDcjwAXXsIKmnxmfhTsrRGggDrNv0HXcjsbh0E3kKpfKQXHpgz9MVUZ59aAnrS5H6gI6CNs87RxFVd_oNEBVsqlJ6JvOTI_Nv-Zp2-qBcrIrirPmULpdU8V9EbrSpVLsUARTF4_Wl4EXmqdky8TwD9nJr7nSC9WFOJmsBT2y83amWVf3l8YFpf9Tf-A9an4iv3Zeqvu56w-EzuQsNPOfM9J7e1yOc_RcbW6Tp0JnZOqirl9b82SZQIrP2ehfgsz3i2w_tuurDBPDUW1a_98Ru9CzB9rCgWMg"
const CLIENT_UUID = "web-db3d212b-afc0-49e8-b321-ea7ce4892591"
const GUID = "a467fdc9-4db8-4401-8d87-76dbbdb2894f"
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

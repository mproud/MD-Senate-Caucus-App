// @ts-nocheck -- this is just scratch
// Just storing code here for now. THis can be implemented in other ways



// Find any unprocessed events
const events = await prisma.billEvent.findMany({
    where: { processedForAlerts: false },
    include: {
        bill: true,
        committee: true,
        floorCalendar: true,
    },
    orderBy: { eventTime: 'asc' },
    take: 100, // batch size
})


// For each event, finds matching alerts. For a simple bill-status alert:
for (const event of events) {
    const alerts = await prisma.alert.findMany({
        where: {
            active: true,
            alertType: 'BILL_STATUS',
            billId: event.billId,
            OR: [
                { eventTypeFilter: null }, // any event
                { eventTypeFilter: event.eventType }, // or specific type
            ],
        },
    })

    for (const alert of alerts) {
        // sendEmail / sendSms / postWebhook based on alert.deliveryChannel + alert.target
        // using event.summary + event.data
    }

    await prisma.billEvent.update({
        where: { id: event.id },
        data: { processedForAlerts: true },
    })
}

////////// sending email digests

/*

update db schema

model OutboundNotification {
  id        Int      @id @default(autoincrement())
  userId    String   // Clerk user ID? email? depending on your system
  email     String   // Where the digest should be sent
  eventId   Int      // BillEvent.id
  createdAt DateTime @default(now())
  sent      Boolean  @default(false)
  sentAt    DateTime?

  event BillEvent @relation(fields: [eventId], references: [id])
  
  @@index([userId, sent])
}


***

// instead of calling Resend directly
await prisma.outboundNotification.create({
  data: {
    userId: alert.userId!,
    email: alert.target,       // the email address for this alert
    eventId: billEvent.id,
  }
})

// then run the digest worker every couple of minutes (or immediately when a new agenda is parsed?)

export async function runDigestWorker() {
    // 1. Gather unsent notifications grouped by user
    const pending = await prisma.outboundNotification.findMany({
        where: { sent: false },
        include: { event: { include: { bill: true } } },
        orderBy: { createdAt: 'asc' }
    })

    const grouped = groupByUser(pending)

    for (const group of grouped) {
        const { userId, email, notifications } = group
        
        // 2. Build digest email body
        const html = buildDigestHtml(notifications)
        
        // 3. Send via Resend
        await resend.emails.send({
            from: "alerts@mysite.com",
            to: email,
            subject: `Your MGA Digest (${notifications.length} updates)`,
            html,
        })

        // 4. Mark notifications as sent
        await prisma.outboundNotification.updateMany({
            where: { id: { in: notifications.map(n => n.id) }},
            data: {
                sent: true,
                sentAt: new Date(),
            }
        })
    }
}

// helper to group notifications by email
function groupByUser(notifs) {
  const map = new Map()

  for (const n of notifs) {
    const key = `${n.userId}:${n.email}`
    if (!map.has(key)) {
      map.set(key, { userId: n.userId, email: n.email, notifications: [] })
    }
    map.get(key).notifications.push(n)
  }

  return Array.from(map.values())
}

// build hte digest HTML
function buildDigestHtml(notifs) {
  let html = `<h2>Your MGA Bill Updates</h2><ul>`
  for (const n of notifs) {
    const ev = n.event
    const bill = ev.bill

    html += `
      <li>
        <strong>${bill.billNumber}</strong>: ${ev.summary}<br/>
        <small>${new Date(ev.eventTime).toLocaleString()}</small>
      </li>
    `
  }
  html += `</ul>`
  return html
}


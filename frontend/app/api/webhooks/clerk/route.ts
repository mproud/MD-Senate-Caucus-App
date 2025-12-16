import { verifyWebhook } from "@clerk/nextjs/webhooks"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { resend } from "@/lib/resend"

export async function POST(req: NextRequest) {
    try {
        const evt = await verifyWebhook(req)
        const { id } = evt.data
        const eventType = evt.type
        console.log(
            `Received webhook with ID ${id} and event type of ${eventType}`,
            { data: evt.data }
        )

        if (eventType === "user.created") {
            const { id: clerkId, email_addresses, first_name, last_name } = evt.data

            // No email addressses is likely a mock/test hook
            if (!email_addresses?.length) {
                return new Response("No email on payload", { status: 200 })
            }
            
            const email = email_addresses[0].email_address
            const name = [first_name, last_name].filter(Boolean).join(" ") || null

            // Upsert user
            const user = await prisma.user.upsert({
                where: { clerkId },
                update: { email, name, firstName: first_name, lastName: last_name },
                create: { clerkId, email, name, firstName: first_name, lastName: last_name },
                select: { id: true, email: true, name: true, welcomeEmailSentAt: true },
            })

            // don't send twice if webhook retries
            if ( user.welcomeEmailSentAt ) {
                return new Response("Already welcomed", { status: 200 })
            }

            // Send welcome email
            const from = process.env.RESEND_FROM
            if ( ! from ) throw new Error("Missing RESEND_FROM env var")

            await resend.emails.send({
                from,
                to: user.email,
                subject: "Welcome!",
                html: `
                    <div>
                        <p>Hi${user.name ? ` ${user.name}` : ""},</p>
                        <p>Welcome — we're glad you're here.</p>
                    </div>
                `,
            })

            // Mark sent
            await prisma.user.update({
                where: { id: user.id },
                data: { welcomeEmailSentAt: new Date() },
            })

            return new Response("Webhook received", { status: 200 })
        }

        // @TODO send an email when a waitlist entry has been received

        return new Response("Webhook received", { status: 200 })
    } catch (err) {
        console.error("Error verifying webhook:", err);
        return new Response("Error verifying webhook", { status: 400 })
    }
}
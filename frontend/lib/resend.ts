import { Resend } from "resend"
import { EmailTemplate } from "./email-template"
import { render } from "@react-email/render"

export const resend = new Resend(process.env.RESEND_API_KEY)

interface TemplateEmailRequest {
    from?: string,
    to: string,
    subject: string,
    html: string,
    preview?: string
}

export async function sendTemplateEmail({
    from, to, subject, html, preview
}: TemplateEmailRequest ) {

    return await resend.emails.send({
        from: from && from.trim() !== "" ? from : `"Caucus Report" <${process.env.RESEND_FROM!}>`,
        // to,
        to: `"Alert test" <alert-test@mattproud.com>`,
        subject: `${to} -- ${subject}`,
        react: EmailTemplate({ html, preview })
    })
}


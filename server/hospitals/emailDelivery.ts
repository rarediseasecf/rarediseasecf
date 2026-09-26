/**
 * Hospital verification email.
 * SMTP_HOST set → real send via nodemailer.
 * Development → the link is also logged so the flow works without SMTP.
 * Production never logs the link (it is a bearer credential).
 */
import nodemailer, { type Transporter } from 'nodemailer'
import type { ServerConfig } from '../config.js'

export interface HospitalVerifyEmailInput {
  to: string
  verifyUrl: string
  publicCaseId: string
  hospitalDisplayName: string
  expiresAt: Date
}

let cachedTransport: { key: string; transport: Transporter } | null = null

function getTransport(config: ServerConfig): Transporter | null {
  if (!config.smtpHost) return null
  const key = `${config.smtpHost}:${config.smtpPort}:${config.smtpUser ?? ''}`
  if (cachedTransport?.key !== key) {
    cachedTransport = {
      key,
      transport: nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth:
          config.smtpUser && config.smtpPass
            ? { user: config.smtpUser, pass: config.smtpPass }
            : undefined,
      }),
    }
  }
  return cachedTransport.transport
}

function buildMessage(input: HospitalVerifyEmailInput): {
  subject: string
  text: string
  html: string
} {
  const expires = input.expiresAt.toUTCString()
  const subject = `Please verify funding case ${input.publicCaseId}`
  const text = [
    `Hello ${input.hospitalDisplayName},`,
    '',
    `A patient submitted a treatment funding case (${input.publicCaseId}) listing your institution.`,
    'Please review the documents and approve or reject the case:',
    '',
    input.verifyUrl,
    '',
    `This single-use link expires ${expires}. Do not forward it.`,
    'If you did not expect this email, you can ignore it.',
    '',
    '— RareDiseaseCF',
  ].join('\n')
  const html = `<p>Hello ${escapeHtml(input.hospitalDisplayName)},</p>
<p>A patient submitted a treatment funding case (<strong>${escapeHtml(input.publicCaseId)}</strong>) listing your institution.
Please review the documents and approve or reject the case.</p>
<p><a href="${escapeHtml(input.verifyUrl)}">Review case ${escapeHtml(input.publicCaseId)}</a></p>
<p style="color:#555">This single-use link expires ${escapeHtml(expires)}. Do not forward it.
If you did not expect this email, you can ignore it.</p>
<p>— RareDiseaseCF</p>`
  return { subject, text, html }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function deliverHospitalVerifyEmail(
  config: ServerConfig,
  input: HospitalVerifyEmailInput
): Promise<{ sent: boolean; logged: boolean }> {
  const message = buildMessage(input)
  const recipientDomain = input.to.split('@')[1] ?? null
  const logLink = !config.isProduction

  if (logLink) {
    console.info(
      JSON.stringify({
        event: 'email_dev_link',
        to: input.to,
        subject: message.subject,
        verifyUrl: input.verifyUrl,
        publicCaseId: input.publicCaseId,
        expiresAt: input.expiresAt.toISOString(),
      })
    )
  }

  const transport = getTransport(config)
  if (!transport) {
    if (!logLink) {
      console.error(
        JSON.stringify({
          event: 'email_not_configured',
          publicCaseId: input.publicCaseId,
          message: 'SMTP_HOST is not set — hospital verification email was not sent.',
        })
      )
    }
    return { sent: false, logged: logLink }
  }

  try {
    await transport.sendMail({
      from: config.smtpFrom,
      to: input.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    })
    console.info(
      JSON.stringify({
        event: 'email_sent',
        publicCaseId: input.publicCaseId,
        recipientDomain,
      })
    )
    return { sent: true, logged: logLink }
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'email_send_failed',
        publicCaseId: input.publicCaseId,
        recipientDomain,
        name: err instanceof Error ? err.name : 'Unknown',
      })
    )
    return { sent: false, logged: logLink }
  }
}

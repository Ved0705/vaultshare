import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

const transporter = nodemailer.createTransport({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: false,
});

export type NotificationEventType =
    | "SHARE_CREATED"
    | "SHARE_REVOKED"
    | "ACCESS_REQUEST_CREATED"
    | "ACCESS_REQUEST_REVIEWED"
    | "WRITE_REQUEST_CREATED"
    | "WRITE_REQUEST_REVIEWED";

const notificationTemplates: Record<NotificationEventType, { subject: string; text: string }> = {
    SHARE_CREATED: {
        subject: "A VaultShare was shared with you",
        text: "A VaultShare has been shared with your account. Sign in to VaultShare to review it.",
    },
    SHARE_REVOKED: {
        subject: "Your VaultShare access has changed",
        text: "Your access to a VaultShare has been revoked. Sign in to VaultShare if you need more information.",
    },
    ACCESS_REQUEST_CREATED: {
        subject: "A VaultShare access request needs review",
        text: "A new VaultShare access request needs your review. Sign in to VaultShare to review it.",
    },
    ACCESS_REQUEST_REVIEWED: {
        subject: "Your VaultShare access request was reviewed",
        text: "Your VaultShare access request has been reviewed. Sign in to VaultShare to see the result.",
    },
    WRITE_REQUEST_CREATED: {
        subject: "A VaultShare write request needs review",
        text: "A new VaultShare write request needs your review. Sign in to VaultShare to review it.",
    },
    WRITE_REQUEST_REVIEWED: {
        subject: "Your VaultShare write request was reviewed",
        text: "Your VaultShare write request has been reviewed. Sign in to VaultShare to see the result.",
    },
};

export async function sendNotificationEmail(
    to: string,
    eventType: NotificationEventType,
): Promise<void> {
    const template = notificationTemplates[eventType];
    if (!template) throw new Error("Unsupported notification event");

    const result = await transporter.sendMail({
        from: env.MAIL_FROM,
        to,
        subject: template.subject,
        text: template.text,
    });

    if (result.accepted.length === 0 || result.rejected.length > 0) {
        throw new Error("Mail server did not accept the notification");
    }

    // Do not log recipient addresses, vault identifiers, share codes or message content.
    logger.info({ eventType }, "VaultShare notification email accepted by SMTP server");
}

export async function sendTestEmail(to: string): Promise<void> {
    await transporter.verify();

    const result = await transporter.sendMail({
        from: env.MAIL_FROM,
        to,
        subject: "VaultShare SMTP Test",
        text: "Your local VaultShare email integration is working.",
    });

    if (!result.accepted.length || result.rejected.length > 0) {
        throw new Error("Mail server did not accept the test email");
    }

    logger.info("Test email accepted by SMTP server");
}

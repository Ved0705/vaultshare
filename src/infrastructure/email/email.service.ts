
import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

const transporter = nodemailer.createTransport({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: false,
});

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

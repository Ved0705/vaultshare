
import "dotenv/config";
import { sendTestEmail } from "./email.service.js";

async function main() {
    const recipient = "test@example.com";

    await sendTestEmail(recipient);

    console.log("Test email submitted to Mailpit");
}

main().catch((error: unknown) => {
    console.error("Email test failed:", error);
    process.exitCode = 1;
});

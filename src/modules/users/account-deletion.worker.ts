import { eq } from "drizzle-orm";
import { pathToFileURL } from "node:url";

import { db } from "../../db/client.js";
import { users } from "../../db/schema/users.js";
import { deleteAccount } from "./account-deletion.service.js";

const POLL_INTERVAL_MS = 30_000;

export async function processPendingAccountDeletions(): Promise<number> {
    const pendingUsers = await db
        .select({
            id: users.id,
            cognitoSub: users.cognitoSub,
        })
        .from(users)
        .where(eq(users.status, "DELETION_PENDING"));

    let processed = 0;

    for (const user of pendingUsers) {
        try {
            await deleteAccount(user.id, user.cognitoSub);
            processed++;
        } catch (error) {
            // Never log tokens, emails, or account contents.
            console.error(
                `Account deletion retry failed for user ${user.id}:`,
                error instanceof Error
                    ? error.message
                    : "Unknown error",
            );
        }
    }

    return processed;
}

async function startAccountDeletionWorker(): Promise<void> {
    console.log("Account deletion retry worker started.");

    while (true) {
        try {
            await processPendingAccountDeletions();
        } catch (error) {
            console.error(
                "Account deletion worker error:",
                error instanceof Error
                    ? error.message
                    : "Unknown error",
            );
        }

        await new Promise((resolve) =>
            setTimeout(resolve, POLL_INTERVAL_MS),
        );
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    void startAccountDeletionWorker();
}
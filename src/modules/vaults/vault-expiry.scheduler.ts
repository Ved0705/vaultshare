
import { processExpiredVaults } from "./vault-expiry.service.js";

const INTERVAL_MS = 60_000;

async function runExpiryScheduler(): Promise<void> {
    console.log("VaultShare expiry scheduler started.");

    while (true) {
        try {
            const processed = await processExpiredVaults();

            if (processed > 0) {
                console.log(`Processed ${processed} expired vault(s).`);
            }
        } catch (error) {
            console.error("Vault expiry scheduler error.", {
                errorName: error instanceof Error ? error.name : "UnknownError",
            });
        }

        await new Promise((resolve) =>
            setTimeout(resolve, INTERVAL_MS),
        );
    }
}

runExpiryScheduler();

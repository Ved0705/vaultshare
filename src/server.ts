
import app from "./app.js";
import { env } from "./config/env.js";

const server = app.listen(env.PORT, () => {
    console.log(`VaultShare API running on port ${env.PORT}`);
});

function shutdown() {
    server.close(() => {
        console.log("VaultShare server stopped");
        process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

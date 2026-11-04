
import { randomBytes } from "node:crypto";

export function generateShareId(): string {
    return randomBytes(24).toString("base64url");
}

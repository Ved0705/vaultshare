import "dotenv/config";
import { z } from "zod";

const base64Key = (value: string) => {
    const key = Buffer.from(value, "base64");
    return key.length === 32 && key.toString("base64") === value;
};

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    CORS_ORIGINS: z.string().default("http://localhost:5173")
        .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
        .refine((origins) => origins.length > 0, "At least one CORS origin must be configured"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    COGNITO_USERINFO_URL: z.string().url(),
    DATABASE_URL: z.string().url(),
    STORAGE_PATH: z.string().min(1),
    MAIL_HOST: z.string().min(1),
    MAIL_PORT: z.coerce.number().int().min(1).max(65535),
    MAIL_FROM: z.string().email().or(z.string().min(1)),
    COGNITO_REGION: z.string().min(1),
    COGNITO_USER_POOL_ID: z.string().min(1),
    COGNITO_CLIENT_ID: z.string().min(1),
    VAULT_KEK_BASE64: z.string().refine(base64Key, "VAULT_KEK_BASE64 must be a valid base64-encoded 32-byte key"),
    VAULT_KEK_V2_BASE64: z.preprocess((value) => value === "" ? undefined : value, z.string().refine(base64Key, "VAULT_KEK_V2_BASE64 must be a valid base64-encoded 32-byte key").optional()),
    VAULT_KEK_CURRENT_VERSION: z.coerce.number().int().min(1).max(2).default(1),
}).superRefine((value, ctx) => {
    if (value.VAULT_KEK_CURRENT_VERSION === 2 && !value.VAULT_KEK_V2_BASE64) {
        ctx.addIssue({ code: "custom", path: ["VAULT_KEK_V2_BASE64"], message: "Version 2 key is required when current KEK version is 2" });
    }
    if (value.NODE_ENV === "production") {
        if (!process.env.CORS_ORIGINS?.trim()) {
            ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "CORS_ORIGINS must be explicitly configured in production" });
        }
        for (const origin of value.CORS_ORIGINS) {
            try {
                if (new URL(origin).protocol !== "https:") {
                    ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "Production CORS origins must use HTTPS" });
                }
            } catch {
                ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "Every CORS origin must be a valid URL" });
            }
        }
    }
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
    console.error("Invalid environment configuration:");
    console.error(z.treeifyError(result.error));
    process.exit(1);
}
export const env = result.data;

ALTER TABLE "shares" DROP CONSTRAINT "shares_post_open_expiry_check";--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_post_open_expiry_check" CHECK ((
                    ("shares"."first_opened_at" IS NULL
                        AND "shares"."post_open_expires_at" IS NULL)
                        OR
                        ("shares"."first_opened_at" IS NOT NULL
                        AND (
                        ("shares"."post_open_ttl_seconds" IS NULL
                        AND "shares"."post_open_expires_at" IS NULL)
                        OR
                        ("shares"."post_open_ttl_seconds" IS NOT NULL
                        AND "shares"."post_open_expires_at" IS NOT NULL)
                        ))
                ));
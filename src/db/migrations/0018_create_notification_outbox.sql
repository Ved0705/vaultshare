CREATE TABLE "notification_outbox" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "recipient_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "event_type" varchar(64) NOT NULL,
    "status" varchar(16) NOT NULL DEFAULT 'PENDING',
    "attempts" integer NOT NULL DEFAULT 0,
    "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
    "last_error" varchar(120),
    "sent_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "notification_outbox_status_check"
        CHECK ("status" IN ('PENDING', 'SENT', 'FAILED')),
    CONSTRAINT "notification_outbox_attempts_check"
        CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "notification_outbox_pending_idx"
    ON "notification_outbox" ("status", "next_attempt_at", "created_at");
--> statement-breakpoint
CREATE INDEX "notification_outbox_recipient_created_idx"
    ON "notification_outbox" ("recipient_user_id", "created_at");

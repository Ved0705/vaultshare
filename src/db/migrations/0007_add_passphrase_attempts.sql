CREATE TABLE "passphrase_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"succeeded" boolean DEFAULT false NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "passphrase_attempts" ADD CONSTRAINT "passphrase_attempts_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passphrase_attempts" ADD CONSTRAINT "passphrase_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passphrase_attempts_share_user_time_idx" ON "passphrase_attempts" USING btree ("share_id","user_id","attempted_at");
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_expiry_timestamp_check" CHECK (
        (
            first_shared_at IS NULL
            AND expires_at IS NULL
        )
        OR
        (
            first_shared_at IS NOT NULL
            AND expires_at IS NOT NULL
            AND expires_at = first_shared_at
                + overall_ttl_seconds * INTERVAL '1 second'
        )
    );
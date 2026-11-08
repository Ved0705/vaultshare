CREATE TABLE "audit_events" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL, actor_cognito_sub varchar(255), action varchar(120) NOT NULL, method varchar(10) NOT NULL, route varchar(255) NOT NULL, resource_id uuid, status_code integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_events_actor_created_idx ON audit_events(actor_user_id, created_at);
CREATE INDEX audit_events_resource_created_idx ON audit_events(resource_id, created_at);
CREATE INDEX audit_events_created_idx ON audit_events(created_at);
CREATE TABLE revoked_access_tokens (jti varchar(255) PRIMARY KEY, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX revoked_access_tokens_expires_idx ON revoked_access_tokens(expires_at);

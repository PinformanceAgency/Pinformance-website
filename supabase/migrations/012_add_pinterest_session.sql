-- Add Pinterest session cookie for GraphQL API access (organic conversion data)
-- The public Pinterest API does not expose organic conversion metrics.
-- Pinterest's internal GraphQL API requires session cookies, not OAuth tokens.
-- Users provide their session cookie from browser DevTools; it's encrypted at rest.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pinterest_session_encrypted text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pinterest_session_expires_at timestamptz;

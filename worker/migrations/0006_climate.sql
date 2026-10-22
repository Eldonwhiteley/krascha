-- The climate changers list puts the most tokens a day first.
CREATE INDEX IF NOT EXISTS scores_by_tokens ON scores (tokens_per_day DESC, uploaded_at);

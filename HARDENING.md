# Observed authority and integrity display

A claimed action never grants its own authority. Callers may supply initialAuthority to buildReplaySession as an explicit observed root set. Delegation requires all requested scopes, and colon-delimited descendants are allowed only in the narrower direction. Parent revocation invalidates descendants. Missing authority is unknown, rather than proof of tampering.

Core verb/who/when/ref/what and runtime previous_event_hash fields are recognized. A core T does not terminate the entire archive. Non-object JSONL records become parse findings.

The UI explicitly says cryptographic verification is not performed. It compares reported links/results and does not recompute event hashes or validate JWS. Its authority projection is a local visualization profile, not a JEP-Core authorization rule.

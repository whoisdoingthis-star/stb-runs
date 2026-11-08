# 0010. Public repository, no secrets in it

- **Date:** 2026-11-08
- **Status:** Accepted (revisit for STB)

## Context
GitHub Pages on the free plan needs a public repository.

## Decision
Keep it public. No secrets, family emails, door codes or customer data in it; CI scans for secret-looking text. Sample run sheets for tests stay out.

## Consequences
Anyone can read the code. Move to a private repository with paid Pages or another host when this becomes part of STB.

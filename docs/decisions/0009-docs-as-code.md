# 0009. Docs as code

- **Date:** 2026-11-08
- **Status:** Accepted

## Context
Documentation kept anywhere else goes stale within a day, and this proof of concept is to be folded into the STB project.

## Decision
Documentation lives in the repository and changes in the same commit as the code ([CONTRIBUTING](../../CONTRIBUTING.md)). CI fails a change that touches code without docs or the changelog, breaks a link, leaves a table undocumented, skips the app version bump, or commits something that looks secret. During the trial changes go straight to `main`; afterwards `main` will be protected and changes will go through pull requests Mike approves.

## Consequences
A little more work per change; in exchange the docs are always current and the PoC moves into STB with its rules and history intact.

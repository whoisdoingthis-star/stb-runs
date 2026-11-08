# 0002. Read the PDF by text position and check every total

- **Date:** 2026-11-06
- **Status:** Accepted

## Context
Run sheets are PDFs. Text extraction alone mixes columns and wrapped notes.

## Decision
Parse by the x/y position of each piece of text, using the header row to find columns. Check totals against the delivery list and the Key Report DRAW before saving; never auto-load a run that doesn't add up.

## Consequences
Robust to wrapped notes and multi-table pages. A layout change by NZME is caught by the totals check instead of silently producing a wrong run.

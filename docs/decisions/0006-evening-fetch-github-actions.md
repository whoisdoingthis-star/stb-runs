# 0006. Evening fetch on GitHub Actions

- **Date:** 2026-11-08
- **Status:** Accepted

## Context
Mike wanted no manual work: sheets are final at 19:00 NZ.

## Decision
A scheduled GitHub Actions job signs in to RouteSmart through its real login page (Playwright), then requests the report from the same API the site uses. It retries every 15 minutes until about 21:50 and stops once all runs are in.

## Consequences
Free and visible (each run has a log). If RouteSmart changes its login, the job fails with a screenshot. GitHub schedules can start late; Get Runs (0007) covers that.

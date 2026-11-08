# 0001. Static web app, no build step

- **Date:** 2026-11-06
- **Status:** Accepted

## Context
The family needed something on Android and iPhone quickly, without app stores.

## Decision
A plain HTML/JS app hosted on GitHub Pages, installable to the home screen, working offline. No framework or build step, so any change is a file edit.

## Consequences
Fast to change and free to host. Folding into the STB Next.js app later means porting screens, but the parser, rows and sequencing modules are framework-free and move as they are.

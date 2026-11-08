# 0004. GPS per tap is for sequencing, not proof of delivery

- **Date:** 2026-11-07
- **Status:** Accepted

## Context
Mike asked for GPS and time on every tap.

## Decision
Record GPS, accuracy and fix age with each tap to learn the real delivery order. It is not presented as proof of delivery (photos are, see 0008).

## Consequences
Accuracy can be loose; that's fine for averaging positions per letterbox (`address_positions`).

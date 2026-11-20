# 0002. Meaning comes only from explicit tags, never from inference

Status: accepted (2026-11-20)

Contract Drift only reports a meaning change when a `@unit`, `@format` or `@tz` tag on the same contract field differs between snapshots, and only judges a usage's assumption from tags on the parameters its value flows into; it never guesses meaning from names, values or an LLM. This gives up coverage of untagged code (it is listed as REVIEW, never as a confident MISMATCH) in exchange for zero invented findings, which is the property a reviewer needs to trust the shortlist and the claim we can defend to judges.

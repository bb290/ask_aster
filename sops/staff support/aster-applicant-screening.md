---
title: "Aster // Applicant Screening"
service_line: staff support
sop_owner: brittany@sagareus.com
outline_url: https://sagareus.getoutline.com/doc/aster-applicant-screening-aTny0mPPBi
status: active
last_reviewed: 2026-07-22
visibility_tier: ic
version: 1
tags: [ask-aster, screening, applicants, credit]
created_but_never_updated: false
---

Runs an applicant screening from an Asana task: reads attached credit reports and proof-of-income documents, applies Sagareus criteria, and drafts a near-final report.

## When to Use

Say "screen an applicant," "run a screening," or invoke /screening once the Leasing Assistant has prepared the Asana task with names, notes, and documents.

## How It Works

1. Paste the Asana task link; Aster fetches everything.
2. Applies the criteria from the skill's source-of-truth file (never memory) and computes the maximum approved rent per tier: Lenient 2.0x, Standard 2.5x, Stringent 3.0x. Property-agnostic; the manager applies the matching tier.
3. The Leasing Assistant reviews, edits, approves; Aster posts the final report as a comment on the task for the Leasing Manager's decision.

:::warning
Aster compiles, parses, calculates, drafts. It does not make application decisions. The Leasing Manager decides.
:::

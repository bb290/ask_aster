# Speed to Lead signatures

One HTML file per agent, keyed by their full Gmail address (lowercase).
The skill reads the authenticated Gmail account, looks up the matching
file, and appends it to the draft body after the `Best,` line.

If no match is found, the skill falls back to `_company.html`.

## File naming

```
courtney@sagareus.com.html
jessica@sagareus.com.html
...
_company.html        ← fallback when no agent file matches
```

## Format

Inline-styled HTML, Gmail-friendly. Per Brittany's spec, each agent
signature carries only:

- Name (bold)
- Job title (emerald)
- Phone | Email (one line)

No company line on individual sigs (the @sagareus.com address makes
that obvious). The company fallback carries the full company info
including address.

## Updating

When an agent joins, leaves, or changes their phone:

1. Edit the matching `<email>.html` file
2. Commit to main, push
3. No deploy needed — the skill reads from this folder at runtime

## Brittany French (operator, bb@sagareus.com)

Not currently in this folder. Her bb@ account falls back to `_company.html`
on test runs. If she wants her own signature on Speed to Lead drafts,
drop `bb@sagareus.com.html` in this folder with the same format.

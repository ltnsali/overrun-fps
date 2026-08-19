---
id: TASK-001
title: Move the developer website from altunsuinsaat.com to the game's own GitHub Pages site
severity: minor
area: store
status: done
found-by: user
devices: [n/a]
---

## Request

> for website lets use github override repo not altunsuinsaat website. lets add
> necessary informations for this webpage. After that lets update my developer
> account with that URL.

## Why the old address was wrong

The publisher page lived at `altunsuinsaat.com/ltns.html` - a construction
company's site, deployed from a different, private repository, through cPanel,
by hand. Three things were wrong with that:

- The page describing a games publisher sat on a domain that says nothing about
  games, and a reviewer following the link from Play landed on a building firm.
- It was published by a separate deploy that had to be remembered. The privacy
  policy already lived on GitHub Pages, so the two halves of the same statement
  could drift apart, and did not even share a hostname.
- It outlives nothing. A domain that stops being paid for takes the publisher
  page, and the Play developer record's verified website, down with it.

## What changed

`ltns.html` was added to this repository and is served at
<https://ltnsali.github.io/overrun-fps/ltns.html>. It carries the trading name,
the responsible person, the address exactly as the Play developer record spells
it, the support address, a description of OVERRUN, and links to the game, the
privacy policy and the source.

It reuses `privacy.html`'s palette and markup conventions verbatim - no build
step, no dependency, one inline stylesheet - so the three pages read as one
property rather than three separate sites that happen to share a host.

Two fields in Play now point at it:

| Where | Field | Value |
| --- | --- | --- |
| Developer account -> Account details -> About you | Website | `https://ltnsali.github.io/overrun-fps/ltns.html/` (verified) |
| OVERRUN -> Store settings -> Store listing contact details | Website | `https://ltnsali.github.io/overrun-fps/ltns.html` |

## The part that was not obvious

Play will not mark the developer website as yours on your say-so. **Send
verification request** checks Google Search Console, and does nothing at all -
no error, no message - if the address is not already a verified property there.

So the working order is: save the URL in Play, add
`https://ltnsali.github.io/overrun-fps/` as a URL-prefix property in Search
Console, verify it, and only then send the request. Verification is by HTML
file, which is why `google0c896c9465203bc7.html` is committed at the repository
root; removing it revokes the verification.

The prefix has to be the directory, not the page. Search Console wants the
verification file at the property's own location, and `.../ltns.html/` is not a
directory that GitHub Pages can serve a file from.

## Left alone deliberately

`altunsuinsaat.com/ltns.html` still exists and still resolves. Nothing points at
it from Play any more, and it costs nothing to leave up; deleting it would only
break whatever already links to it.

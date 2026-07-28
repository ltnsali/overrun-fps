# Play Console listing — OVERRUN

Everything the Play Console asks for, written down once so the answers stay
consistent between submissions. Nothing here is aspirational: if the game
changes, this file changes with it.

Assets referenced below are generated, not drawn by hand — `npm run art`
rebuilds the icon and feature graphic, `npm run store:shots` recaptures the
screenshots from the app running on a real device or emulator.

---

## App details

| Field | Value |
| --- | --- |
| App name | `OVERRUN` |
| Package | `com.overrun.fps` |
| Default language | English (United States) |
| Type | Game |
| Category | Action |
| Tags | Shooter, Arcade, Multiplayer |
| Free or paid | Free |
| Contains ads | **No** |
| In-app purchases | **No** |
| Website | https://ltnsali.github.io/overrun-fps/ |
| Privacy policy | https://ltnsali.github.io/overrun-fps/privacy.html |

---

## Short description (80 characters max)

```
Fast arena FPS. Survive endless waves solo, or frag your friends in deathmatch.
```

78 characters.

---

## Full description (4000 characters max)

```
OVERRUN is a fast, no-nonsense arena shooter. No accounts, no ads, no timers,
no waiting for a download the size of a film. Open it and you are already in a
firefight.

SURVIVE THE WAVES
Hold an arena against wave after wave of hostiles that get faster, tougher and
more numerous every round. Grunts rush you. Stalkers flank. Marksmen and
Gunners pin you down from range. Every few waves a Warlord turns up and the
arena stops being yours. Chain kills to build a combo multiplier, and push your
best score higher than the last run.

FIVE WEAPONS, ONE LOADOUT
A pistol that never runs dry, an SMG that shreds at close range, a shotgun for
doorways, a sniper rifle for the long lanes, and a rocket launcher for when the
answer is obviously a rocket launcher. Frag grenades, a melee bash, and a
sprint bar that makes you choose between getting there and getting out.

DEATHMATCH WITH YOUR FRIENDS
Share a room code and fight it out. Matches are peer to peer, so there is no
server queue and no lobby waiting room — the first player in owns the arena and
everyone else drops straight in. Every player generates the same arena from the
room code, so you are all in the same building, shooting at each other in it.
Frag limit and match length are set for you; you just play.

BUILT FOR TOUCH
Full on-screen controls: a proper movement stick, drag-to-aim on the fire
button, and dedicated jump, crouch, reload, grenade, melee and weapon-swap
buttons. Aim down sights by dragging. Nothing is buried in a menu.

RUNS ON WHAT YOU HAVE
The whole game is a few megabytes and renders with WebGL. Quality, resolution
scale, shadows and field of view are all yours to adjust, and the defaults are
picked to keep a phone at a steady frame rate rather than to look good in a
screenshot.

PLAYS OFFLINE
Single player needs no connection at all. Everything is bundled in the app —
there is no download on first launch, no login, and no "server unavailable".

NO STRINGS
No account. No advertising. No analytics. No in-app purchases. Your settings
and your best score stay on your device. Multiplayer sends only your callsign
and your position, and it sends them directly to the other players.
```

---

## Graphics

| Asset | File | Spec Play enforces | Ours |
| --- | --- | --- | --- |
| App icon | `store/icon-512.png` | 512 × 512, **32-bit PNG with alpha**, ≤ 1024 KB | 512 × 512, `Format32bppArgb`, 187 KB |
| Feature graphic | `store/feature-1024x500.jpg` | 1024 × 500, JPEG or **24-bit PNG with no alpha** | 1024 × 500 JPEG, `Format24bppRgb`, 76 KB |
| Phone screenshots | `store/screenshots/*.png` | 2–8, each side 320–3840 px, long side ≤ 2× short | 5 × 1920 × 1080 |
| Tablet / Chromebook | `store/screenshots-tablet/*.png` | ≥ 4, 1080–7680 px, 16:9 landscape | 5 × 1920 × 1080 |

A canvas always produces PNG with an alpha channel, which is exactly what the
feature graphic may not have - so `tools/art.js` writes that one as JPEG, which
Play accepts and which cannot carry alpha. The icon has the opposite rule and
stays PNG.

Play refuses a screenshot whose long side is more than twice its short one, and a
Pixel 5 framebuffer is 2340 × 1080 - just over that line. `tools/screenshots.js`
therefore fits each capture onto a 16:9 canvas rather than cropping into the HUD.
The same 16:9 result satisfies the large-screen rule, so the tablet set is
captured the same way from a Pixel Tablet emulator rather than reusing the phone
images.

---

## Technical requirements, checked rather than assumed

Verified against the official pages on 28 July 2026.

| Requirement | Rule | Status |
| --- | --- | --- |
| Target API level | New apps and updates must target **API 36** from **31 Aug 2026** | `targetSdk 36` — in the merged manifest |
| Publishing format | Android App Bundle, not APK | `npm run android:bundle` → 3.67 MB `.aab` |
| Play App Signing | Mandatory for new apps | Enrolled at app creation; we hold only the upload key |
| 16 KB page sizes | Required from **1 Nov 2025** for apps targeting Android 15+ **that ship native code** | The bundle contains **no `.so` files at all**, so this is satisfied by definition |
| 64-bit | Required | No native code, nothing to be 32-bit |
| `android:exported` | Explicit on every component with an intent filter (API 31+) | `MainActivity` only, `exported="true"` |
| Edge to edge | Enforced from API 35 | Handled by `MainActivity`, insets applied explicitly |
| Foreground services | Must declare a type (API 34+) | None used |
| Advertising ID | Permission must be declared if used | Not used, not declared |
| Bundle size | ≤ 200 MB | 3.67 MB |
| `versionCode` | Must strictly increase | Derived from `package.json`: `1.0.0` → `10000` |

---

## Content rating questionnaire

| Question | Answer |
| --- | --- |
| Category | Game |
| Violence — does the app contain violence? | Yes |
| Is the violence realistic? | **No.** Enemies are untextured geometric shapes. |
| Blood or gore? | **No.** There is no blood, no dismemberment, no corpses. |
| Violence against humans or animals? | **No.** Targets are abstract hostiles. |
| Sexual content, nudity | No |
| Language, profanity | No |
| Controlled substances | No |
| Gambling, simulated gambling | No |
| User-generated content | **No.** Callsigns are visible only to the players in a match and are never stored or transmitted to us. |
| Users can interact / share location | **No.** There is no chat, no friends list and no location sharing. |
| Digital purchases | No |

Expected outcome: PEGI 7 / ESRB Everyone 10+ / USK 6 or thereabouts.

---

## Data safety

**Does your app collect or share any of the required user data types? — No.**

The app collects nothing, so every following question collapses. For the
reviewer's benefit, the reasoning behind that answer:

| Point | Answer |
| --- | --- |
| Personal info, financial info, location, contacts, files, photos | Not collected, not accessed. |
| App activity, scores, settings | Stored on the device only (`localStorage`), never transmitted. Play does not count on-device-only storage as collection. |
| Crash logs, diagnostics, analytics | No SDK of any kind is bundled. |
| Advertising ID | Not requested, no ads library present. |
| Data encrypted in transit | Yes — multiplayer runs over WebRTC data channels, which are DTLS-encrypted, and signalling is over `wss`. |
| Can users request deletion? | There is nothing held to delete; uninstalling removes the local settings. |

Note for the listing team: multiplayer necessarily exposes a player's IP address
to the other players in the same room and to the WebRTC signalling and STUN
services, exactly as any peer-to-peer game does. This is disclosed plainly in
the privacy policy. Play does not treat this as data collection by the
developer, because none of it reaches us.

---

## App access

No login, no region lock, no gated content. Every part of the app is reachable
from the main menu on first launch. Nothing to give the reviewer.

---

## Account deletion

"Does your app allow users to create an account?" — **No.** The callsign typed in
the multiplayer lobby is not an account: it is not registered anywhere, not
unique, not authenticated, and never leaves the device except as a label inside a
match. There is therefore no account to delete and no deletion URL to provide.
Uninstalling removes the three local values listed in the privacy policy.

---

## Ads

The app contains no ads. Declare **No**.

---

## Target audience and content

- Target age groups: **13–15, 16–17, 18 and over.**
- Not designed for children; do not opt into the Designed for Families programme.
- Store presence appeals primarily to the selected age groups: the icon and
  feature graphic are abstract and the screenshots are gameplay.

---

## Government apps / financial features / health

None apply. Answer no to all.

---

## Countries and pricing

Free, available in all countries Play supports. No pricing to set.

---

## Account gates before any of this matters

These are account-level, not app-level, and they are the long pole:

- A Play developer account costs **US$25 once** and requires identity
  verification. An organisation account additionally needs a **D-U-N-S number**.
- A **personal** account created after **13 November 2023** must run a **closed
  test with at least 12 testers who stay opted in for 14 continuous days**, and
  then apply for production access. An organisation account is exempt.
- Start this before the build is ready. Everything else here is minutes of work;
  this part is a fortnight of waiting.

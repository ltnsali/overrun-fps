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

| Asset | File | Size |
| --- | --- | --- |
| App icon | `store/icon-512.png` | 512 × 512 |
| Feature graphic | `store/feature-1024x500.png` | 1024 × 500 |
| Phone screenshots | `store/screenshots/1-menu.png` … `5-multiplayer.png` | 1920 × 1080 |

Play wants two to eight phone screenshots, each side between 320 px and 3840 px,
with the long side no more than twice the short one. A Pixel 5 framebuffer is
2340 × 1080, which is just over that line, so `tools/screenshots.js` fits each
capture onto a 16:9 canvas rather than cropping into the HUD.

There is no tablet-specific artwork. The game is one landscape layout that
scales, so the phone screenshots are reused for the 7-inch and 10-inch slots.

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

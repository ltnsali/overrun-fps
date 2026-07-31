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
and your best score stay on your device. Multiplayer sends your callsign, your
position, your aim and your hits straight to the other players in your room and
nowhere else.
```

The Metadata policy requires the description to describe the app accurately, so
the last paragraph tracks what `14-multiplayer.js` actually puts on the wire -
not just the callsign and position.
<https://support.google.com/googleplay/android-developer/answer/9898842>

`OVERRUN` in caps is allowed because it is the brand name; the policy's ban on
ALL CAPS applies to titles, icons and developer names that are not brands. The
title is 7 of the 30 characters Play allows.

---

## Graphics

| Asset | File | Spec Play enforces | Ours |
| --- | --- | --- | --- |
| App icon | `store/icon-512.png` | 512 × 512, **32-bit PNG with alpha**, ≤ 1024 KB | 512 × 512, `Format32bppArgb`, 187 KB |
| Feature graphic | `store/feature-1024x500.jpg` | 1024 × 500, JPEG or **24-bit PNG with no alpha** | 1024 × 500 JPEG, `Format24bppRgb`, 76 KB |
| Phone screenshots | `store/screenshots/*.png` | ≥ 2 across device types, ≤ 8 each, JPEG or **24-bit PNG with no alpha**, each side 320–3840 px, long side ≤ 2× short | 5 × 1920 × 1080, 24-bit PNG |
| Tablet / Chromebook | `store/screenshots-tablet/*.png` | ≥ 4, 1080–7680 px, 16:9 landscape, same no-alpha rule | 5 × 1920 × 1080, 24-bit PNG |

Specs verified against <https://support.google.com/googleplay/android-developer/answer/9866151>.

A canvas always produces PNG with an alpha channel, and **both** the feature
graphic and the screenshots are barred from carrying one - the screenshot rule is
worded identically to the feature graphic's, "JPEG or 24-bit PNG (no alpha)", and
is easy to miss. `tools/art.js` therefore writes the feature graphic as JPEG, and
`tools/screenshots.js` carries its own 24-bit PNG encoder rather than using
`toDataURL`, which only ever emits colour type 6. The icon has the opposite rule -
32-bit PNG *with* alpha - and stays PNG.

Play also wants at least three 16:9 landscape screenshots at 1920 × 1080 or better
for a game to be eligible for the large-format recommendation surfaces. Five at
that size clears it.

Play refuses a screenshot whose long side is more than twice its short one, and a
Pixel 5 framebuffer is 2340 × 1080 - just over that line. `tools/screenshots.js`
therefore fits each capture onto a 16:9 canvas rather than cropping into the HUD.
The same 16:9 result satisfies the large-screen rule, so the tablet set is
captured the same way from a Pixel Tablet emulator rather than reusing the phone
images.

---

## Technical requirements, checked rather than assumed

Verified against the official pages on 30 July 2026.

| Requirement | Rule | Status |
| --- | --- | --- |
| Target API level | New apps and updates must target **API 36** from **31 Aug 2026**; an extension to 1 Nov 2026 can be requested in Play Console (<https://support.google.com/googleplay/android-developer/answer/11926878>) | `targetSdkVersion = 36` in `android/variables.gradle`, `minSdkVersion = 23` |
| App registration in Play Console | From **30 Sep 2026**, apps must be registered in Play Console to satisfy the Android developer verification requirements, or face global removal (<https://support.google.com/googleplay/android-developer/table/12921780>) | Nothing to do for an app created in Play Console — but check the Console **Home** page for an outstanding registration task before the deadline |
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
| User-generated content | **Yes.** See below — the callsign is UGC under Play's own definition. |
| Users interact | **Yes.** Deathmatch shows every player an unfiltered name that another player typed. |
| Shares location | **No.** No physical location is collected, transmitted or displayed. |
| Digital purchases | No |

Expected outcome: this is a guess, not a result. IARC assigns the rating, and
answering "yes" to violence, UGC and users-interact moves it. PEGI's own wording
puts "very mild violence … implied or non-detailed, non-realistic violence" at
**PEGI 7** and "violence of a slightly more graphic nature towards fantasy
characters" at **PEGI 12**; a first-person shooter with a rocket launcher and
explosions is more plausibly the latter. Plan for **PEGI 12 / ESRB Teen or
Everyone 10+ / USK 12**, and treat anything lower as a bonus.
<https://www.globalratings.com/ratings-guide.aspx>

Misrepresenting content on the questionnaire is grounds for removal or
suspension, and the questionnaire must be retaken whenever a change to content
or features would change an answer.
<https://support.google.com/googleplay/android-developer/answer/9898843>

---

## User-generated content — the callsign

This was previously answered "no" here. That answer is wrong, and the correction
matters because the UGC policy carries obligations, not just a checkbox.

Play defines UGC as *"content that users contribute to an app, and which is
visible to or accessible by at least a subset of the app's users."*
<https://support.google.com/googleplay/android-developer/answer/9876937>

The callsign is free text a player types (`mpClean` in `14-multiplayer.js` folds
it to `[A-Z0-9]` and 12 characters, which is a charset limit, not a filter), it
is stored in `overrun_name`, it is sent to every other player in the room, and it
is drawn in the killfeed and the scoreboard. That is content contributed by a
user and visible to a subset of the app's users. It is UGC. The fact that it is
not an account, is not registered, and never reaches us changes none of the three
clauses in that sentence.

ESRB's descriptor for the same thing is *Users Interact* — *"indicates possible
exposure to unfiltered/uncensored user-generated content"* — which is exactly
what an unfiltered 12-character name is.
<https://www.esrb.org/ratings-guide/>

What the policy then asks for, and where we stand:

| Requirement | Status |
| --- | --- |
| Users accept terms of use / a user policy before creating UGC | **Missing.** The lobby takes a callsign and nothing else. |
| Terms define and prohibit objectionable content | **Missing.** There are no in-app terms. |
| In-app reporting of objectionable UGC and users | **Missing.** |
| In-app blocking of users | **Missing.** |
| Moderation proportionate to the UGC hosted | Nothing to moderate server-side — there is no server — but the above is client-side work. |

Room codes are short and guessable, so a match is not a closed circle of friends;
the "publicly accessible UGC" reading is the safe one to plan against.

**This needs a code decision, not a listing edit.** Two ways out, in rough order
of effort:

1. Stop accepting free text. Pick the callsign from a fixed list, or generate it
   from the room code and a slot number. If a player cannot contribute content,
   there is no UGC and the questionnaire answer goes back to "no".
2. Keep free text and build the rest: a terms-acceptance gate before the first
   match, plus in-match report and mute/block on the scoreboard.

Option 1 is a smaller change than it sounds — `MP_BOT_NAMES` already exists — and
it removes a whole policy surface. Option 2 is what a game that wants real
identity has to do.

---

## Data safety

**Answer: does your app collect or share any of the required user data types? —
Yes.** Only in multiplayer; single player transmits nothing.

This was argued both ways and the argument is worth keeping, because the tempting
answer is the wrong one.

Play defines *collect* as **"transmitting data from your app off a user's
device"** — not "sending it to the developer". Multiplayer transmits the callsign
off the device, and Play's `Name` data type is *"how a user refers to themselves,
such as their first or last name, or nickname"*. So the callsign is a declarable
data type that leaves the device, and "we never see it" is not on its own a
reason to answer no.
<https://support.google.com/googleplay/android-developer/answer/10787469>

The case for answering **no** rests on the end-to-end encryption carve-out:
*"user data that is sent off device, but that is unreadable by you or anyone
other than the sender and recipient as a result of end-to-end encryption does not
need to be disclosed."* Deathmatch traffic does travel over DTLS-encrypted WebRTC
data channels.

It does not hold. The carve-out requires the data to be unreadable by *"any
intermediary entity"*, and this is a star, not a mesh: the room host
rebroadcasts, so between two non-host players the host decrypts and re-encrypts.
The host is another player and a legitimate recipient of the name by design — but
it is still a link in the chain that reads the data. Add that the whole stream is
relayed through PeerJS TURN servers when a direct connection fails, and the
claim gets harder to defend rather than easier.

So: declare it. The cost of over-declaring here is nothing — no ads, no
analytics, no data retained anywhere. The cost of under-declaring is the exact
mismatch between the form and [privacy.html](../privacy.html) that Play says it
detects and enforces against.

### Data types to declare

| Type | Collected | Shared | Purpose | Notes |
| --- | --- | --- | --- | --- |
| **Name** (callsign) | Yes | Yes | App functionality | Optional; user-chosen; visible to the other players in the room. Mark **processed ephemerally** — it is never written to a server. |
| Everything else | No | No | — | — |

### The rest of the form

| Point | Answer |
| --- | --- |
| Personal info, financial info, location, contacts, files, photos | Not collected, not accessed. |
| App activity, scores, settings | Stored on the device only (`overrun_set`, `overrun_best`, `overrun_name`). Play does not count on-device-only storage as collection. Note these ride Android Auto Backup to the user's own Drive — disclosed in the privacy policy. |
| Crash logs, diagnostics, analytics | No analytics, crash-reporting or advertising SDK is bundled. The third-party code shipped is three.js, PeerJS and Capacitor itself; none of them reports anything to us or to its authors. |
| Advertising ID | Not requested, no ads library present, `AD_ID` permission not declared. |
| Data encrypted in transit | Yes — WebRTC data channels are DTLS-encrypted and PeerJS signalling is over `wss`. |
| Can users request deletion? | No deletion mechanism, because nothing is retained off-device. Uninstalling removes the local values. |
| Data deletion questions | Must still be answered. Every developer completes them, whether or not the app has accounts. |


**Decision recorded.** The carve-out requires the data to be unreadable by *"any
intermediary entity"*, and the star topology puts the room host in that position
between two non-host players. That is why the answer above is **Yes** rather than
the tempting **No**: declaring costs nothing here, and a form that contradicts
the privacy policy is exactly what Play looks for.

Note for the listing team: multiplayer necessarily exposes a player's IP address
to the other players in the same room and to the WebRTC signalling and STUN
services, exactly as any peer-to-peer game does. This is disclosed plainly in
the privacy policy. Play's own guidance is that IP addresses are declared
*"based on their particular usage and practices"* — the worked example being an
IP used to determine location, which must then be declared as location. We use
the IP for nothing but establishing the connection: it is not logged, not stored
and not resolved to a location, so no data type follows from it.

---

## App access — Play Console calls this "Sign-in details"

No login, no region lock, no paywall, no gated content. Every part of the app is
reachable from the main menu on first launch, so there is nothing to give the
reviewer and the declaration is simply "all functionality is available without
special access".

The one thing worth writing in the free-text box: deathmatch needs a second
player. A reviewer alone in a room sees an empty arena, which reads like a broken
feature. Tell them the survival mode is the whole single-player game and that
deathmatch is peer-to-peer with a shared room code.
<https://support.google.com/googleplay/android-developer/answer/15748846>

---

## Account deletion

"Does your app allow users to create an account?" — **No.** The callsign typed in
the multiplayer lobby is not an account: it is not registered anywhere, not
unique, not authenticated, and never leaves the device except as a label inside a
match. There is therefore no in-app deletion path and no deletion URL to provide.
Uninstalling removes the three local values listed in the privacy policy.

The Data deletion questions inside the Data safety form still have to be
completed — that requirement is on *all* developers, not only those with
accounts.
<https://support.google.com/googleplay/android-developer/answer/13327111>

---

## Ads

The app contains no ads of any kind — no ad SDK, no banners, no interstitials, no
house ads promoting other apps. Declare **No**. Misrepresenting the presence of
ads is a suspension-grade violation, and Google verifies the label independently.
<https://support.google.com/googleplay/android-developer/answer/9859455>

---

## Target audience and content

- Target age groups: **13–15, 16–17, 18 and over.**
- Not designed for children; do not opt into the Designed for Families programme.
- Store presence appeals primarily to the selected age groups: the icon and
  feature graphic are abstract and the screenshots are gameplay.

Two things to keep in mind when ticking these boxes:

- Play notes that **13–15 and 16–17 "may be considered to include children in
  some locales"**. Selecting them is still correct for this game, but it is why
  the Families answers must stay consistent — and why the UGC gap above is not a
  cosmetic problem.
- If the store listing contains marketing elements that suggest a children's app
  (youthful animation, young characters), Play may reject it and require either
  the assets or the age groups to change. Generated abstract art keeps us clear
  of that, and any future hand-drawn asset should be checked against it.

<https://support.google.com/googleplay/android-developer/answer/9867159>

---

## The rest of the App content page

None of these apply, but most of them are **mandatory to complete** rather than
skippable, which is the part that catches people out.

| Declaration | Answer | Note |
| --- | --- | --- |
| Government apps | Not a government app | The declaration itself is required of everyone since 31 Jan 2023 (<https://support.google.com/googleplay/android-developer/answer/9514050>) |
| Financial features | No financial features | Explicitly required even from apps with none: "even developers with apps that do not offer any financial features must complete this form and certify that no financial features are offered" (<https://support.google.com/googleplay/android-developer/answer/13849271>) |
| Health apps | Not a health app | No health category applies |
| News and Magazine apps | Not a news app | Category is Action, nothing in the title or description claims news |
| COVID-19 contact tracing / status | No | |
| Advertising ID | Not used, permission not declared | |
| AI-generated content | No | Nothing in the app generates content with AI. The store icon and feature graphic are drawn procedurally by `tools/art.js`, which is canvas code, not a model |
| Age-Restricted Content and Functionality | Does not apply | The policy covers real-money gambling and apps whose *core functionality* is matchmaking or dating. From **26 Aug 2026** it also covers apps whose core functionality is randomly connecting strangers to communicate, or communicating anonymously. OVERRUN's core functionality is a shooter, room codes are shared rather than randomly matched, and there is no communication channel at all (<https://support.google.com/googleplay/android-developer/answer/16302250>) |
| Violence (Inappropriate Content policy) | Compliant | "Apps that depict fictional violence in the context of a game … are generally allowed"; the ban is on *gratuitous* violence and graphic depictions of *realistic* violence (<https://support.google.com/googleplay/android-developer/answer/9878810>) |

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
  <https://support.google.com/googleplay/android-developer/answer/14151465>
- A new personal account must also **verify a real Android device** — non-rooted,
  Android 10 or later — by signing in to the Play Console mobile app as the
  account owner. An emulator will not do it.
  <https://support.google.com/googleplay/android-developer/answer/14316361>
- Separately from the account, the **app** must be registered in Play Console by
  **30 Sep 2026** under the Android developer verification rules. Apps created in
  the Console are registered as a side effect; check the Home page for an
  outstanding task rather than assuming.
- Start this before the build is ready. Everything else here is minutes of work;
  this part is a fortnight of waiting.

---
name: play-store-release
description: "Use when publishing an Android app to Google Play, or working on any part of a Play Console submission: creating the app, filling the App content declarations (privacy policy, ads, app access, content rating, target audience, data safety, advertising ID, government/finance/health), building the store listing, generating store graphics, creating an upload keystore, building a signed AAB, or verifying store assets meet Play's format rules. Also use when a Play Console form rejects an upload or refuses to save, when an IARC content rating needs answering, or when setting up cPanel/Search Console website verification for a developer page."
---

# Shipping an Android app to Google Play

Written from a real submission (OVERRUN, a Capacitor-wrapped WebGL game, Aug 2026).
Everything here was hit in practice, not read in a guide.

## The one rule

**Answer every form from the source, not from memory or from a previous draft.**

The single worst moment of the last submission: a notes file confidently recorded
"no blood, no dismemberment" and "targets are abstract hostiles" for the content
rating. Reading the code took four minutes and showed enemies built from a torso,
head, two arms and two legs with a dedicated headshot hitbox, plus `fxBlood`,
`fxGib` and a red-particle flesh impact with the blood setting defaulted **on**.
Both recorded answers were misrepresentations, which is a suspension-grade
offence. Grep before you tick.

Useful greps before the rating questionnaire:

```
blood|gore|gib|corpse|ragdoll|dismember
Geometry|head|torso|arm|leg          # are the targets humanoid?
chat|voice|message|profanity          # communication features
```

## Order of operations

The App content declarations block every release, and the closed-test clock is
the longest pole. Do them in this order:

1. **Create the app** — name, package, language, game/app, free/paid
2. **App content** — 10 declarations, all mandatory
3. **Store settings** — category and contact details
4. **Main store listing** — text and graphics
5. **Internal testing** — upload the AAB, install it yourself
6. **Closed testing** — a personal account needs **12 testers opted in for 14
   continuous days** before it can even apply for production

## Irreversible choices at app creation

- **Package name** is permanent. It is now asked for on the create-app form, not
  at first upload, and there is a "check availability" button — use it.
- **Free cannot be changed to paid** later. Paid → free is allowed; free → paid
  is not.
- Accepting **Play App Signing** means Google holds the real signing key. Yours
  becomes an *upload* key, so losing it is recoverable via a reset request rather
  than fatal. Generate it with a random password you never see:

```powershell
$b = New-Object byte[] 30
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$pw = ([Convert]::ToBase64String($b) -replace '[+/=]','X')
keytool -genkeypair -keystore upload-keystore.jks -storetype PKCS12 `
  -keyalg RSA -keysize 4096 -validity 10000 -alias upload `
  -dname "CN=..., O=..., C=.." -storepass $pw -keypass $pw
```

Write `$pw` straight to a file outside the repo, redact it from any echoed
output, then `$pw = $null`. Gitignore the keystore and the password file.

In `app/build.gradle`, use `rootProject.file(...)` for the keystore path —
plain `file()` resolves relative to the **app module**, not the project root,
and the error ("Keystore file not found") points at a path you never typed.

## The 10 App content declarations

In the order Play lists them, with the answers that apply to a no-ads,
no-accounts, no-IAP game:

| # | Declaration | Note |
| --- | --- | --- |
| 1 | Privacy policy | A live URL. Must match the Data safety form or Play flags the mismatch. |
| 2 | Ads | "No" only if there is genuinely no ad SDK, including house ads for your own apps. |
| 3 | App access | "No" = everything reachable without login. |
| 4 | Content ratings | IARC questionnaire — see below. |
| 5 | Target audience | Under-13 groups are **greyed out** once the ESRB rating is Teen. |
| 6 | Data safety | Multi-step — see below. |
| 7 | Advertising ID | "No" if `AD_ID` is not declared and no ads library ships. |
| 8 | Government apps | Mandatory for everyone. |
| 9 | Financial features | Mandatory for everyone, even with none. **Two steps.** |
| 10 | Health apps | Mandatory for everyone. **Two steps.** |

**Trap:** Finance and Health are two-step wizards. Ticking "my app has none" and
pressing the visible button only finishes step 1 — the overview will still list
the declaration as outstanding, relabelled "Edit declaration". Press **Next**,
then **Save** on the second step.

## IARC content rating

Sections unlock one at a time — answering one reveals the next, so a loop that
"answers every unanswered radiogroup" walks straight into the questions that need
a different answer. Stop and read each section.

The Miscellaneous section asks whether the game has **native voice chat, text
messaging, or image/audio sharing**. A user-chosen display name is none of those,
so "no" is correct there — but the name is still user-generated content under the
*Play policy*, which is a separate obligation (terms acceptance, in-app reporting,
blocking). Do not let the "no" here convince you the UGC policy is satisfied.

For a first-person shooter expect: ESRB 13+, PEGI 12, USK 16.

## Data safety

Five steps. The parts that are not obvious:

- **"Collected" means transmitted off the device** — not "sent to the developer".
  If a display name reaches other players, it is collected *and* shared, even
  though no server of yours ever sees it.
- The **end-to-end-encryption carve-out** requires the data to be unreadable by
  *any intermediary*. In a star topology the host player decrypts and rebroadcasts,
  so the carve-out does not apply. Over-declaring costs nothing; a form that
  contradicts the privacy policy is exactly what Play looks for.
- Mark transient data **processed ephemerally** — it is then declared but not
  shown to users, and the store listing reads "no data collected".
- Each data type has **two purpose blocks**: one for collection, one for sharing.
  Tick the purpose in both.
- The data-deletion questions must be answered **even with no accounts**.

## Store graphics — the alpha-channel trap

The rules are inconsistent on purpose and easy to get backwards:

| Asset | Size | Alpha |
| --- | --- | --- |
| App icon | 512×512 | **32-bit PNG *with* alpha** |
| Feature graphic | 1024×500 | JPEG or 24-bit PNG, **no alpha** |
| Phone/tablet screenshots | 16:9 or 9:16 | JPEG or 24-bit PNG, **no alpha** |
| Developer page icon | 512×512 | JPEG or 24-bit PNG, **no alpha** |
| Developer page header | 4096×2304 | JPEG or 24-bit PNG, **no alpha**, ≤1 MB |

A canvas `toDataURL('image/png')` **always** emits colour type 6 (RGBA). So
anything in the no-alpha column must be written as JPEG, or through a PNG encoder
you control. Generating art with Playwright's Chromium and a 2D canvas keeps the
palette in one place and adds no image dependency.

Two more that bite:

- Play rejects a screenshot whose **long side is more than twice its short side**.
  A 2340×1080 phone framebuffer is just over the line — fit the capture onto a
  16:9 canvas rather than cropping.
- The developer icon is rendered as a **circle**, and the header has the developer
  name drawn over the middle of it and is cropped hard on narrow screens. Keep the
  icon's mark inside a centred disc; put **no type at all** on the header.

Verify rather than trust the exporter. Read the dimensions out of the file:

```js
// JPEG: walk to the SOF marker
if (b[i] >= 0xc0 && b[i] <= 0xcf && ![0xc4,0xc8,0xcc].includes(b[i]))
  { height = b.readUInt16BE(i+5); width = b.readUInt16BE(i+7); }
// PNG: byte 25 is the colour type — 2 = truecolour, 6 = truecolour+alpha
```

## Uploading assets in the Console

The store listing does not use a plain file input. The flow is:

1. Click **Add item** on the group
2. A side panel opens — click **Upload**, which fires the file chooser
3. `setFiles(...)`, wait for the upload (several seconds *per file*)
4. The asset appears **selected**; click the panel's **Add** button
   (`button[aria-label="Add"]` — its text also contains an icon ligature, so
   matching on `/^Add$/` fails)
5. The group shows `n / m` when it has taken

If the side panel is left open it intercepts clicks on the page behind it. Close
it before touching the next group.

## Store listing text

- Short description ≤ 80 characters, full ≤ 4000. Count them, do not eyeball.
- ALL-CAPS is banned in titles except for a genuine brand name.
- The description must match what the app actually does — the metadata policy is
  enforced. If the netcode sends position and hit data, say so.
- The developer-page promo text (≤140 chars) sits under the list of *everything*
  you publish, so describe the publisher, not one game. Do not promise a catalogue
  that does not exist.

## Website and developer page

- The Play website field and the privacy policy can live on any domain you
  control — a subpage of an unrelated site is fine.
- Play verifies website ownership through **Google Search Console**, and the
  request goes to whoever owns the property, so register it with **the same
  Google account as the developer account**. The HTML-file method is easiest:
  drop `google<token>.html` in the site root and keep it there — Search Console
  re-checks, and losing it drops the verification.
- For a **personal** account Play publishes only your legal name, country and
  developer email; the **full address is published only if you monetise**.
- Identity verification is document-based: an EEA/Swiss photo ID plus a separate
  proof of address, and the documents must match the linked **Google Payments
  profile exactly**. Pick the document first, then make the profile match it.

## Verification discipline

Every claim in this file was checked by measurement. Do the same:

- After each declaration, confirm the "changes saved" banner rather than assuming
  the click landed.
- After the store listing, re-read the overview — a declaration can look done and
  still be listed as outstanding.
- Before submitting, build and verify the bundle:

```powershell
npm run android:bundle
jarsigner -verify app-release.aab          # expect "jar verified"
keytool -printcert -jarfile app-release.aab
java -jar bundletool.jar build-apks --connected-device ...   # then install and launch
```

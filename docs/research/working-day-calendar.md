# Working-day calendar source

Research for the [Working-day calendar source](https://github.com/MapColonies/StaleMate/issues/11) ticket, part of the [map issue](https://github.com/MapColonies/StaleMate/issues/1). **Waiting Time** is as defined in [`CONTEXT.md`](../../CONTEXT.md).

**Already decided** (from the [Dashboard UI prototype](https://github.com/MapColonies/StaleMate/issues/5) ticket): Waiting Time is measured in **working time**. Non-working days are **Friday, Saturday, chagim (yom tov) and erev chag**. Chol hamoed counts as working. The dashboard shows and sorts by working time and shows wall-clock time on hover. Urgency levels are 1, 2 and 5 working days.

This document answers one question: **where do the non-working dates come from?**

## Method and sources

I ran everything on 2026-10-12 in a scratch directory outside the repo, using Node v24.12.0.

- **`date-holidays` 3.37.0** (with `date-holidays-parser` 3.4.7), installed from npm. I read its `package.json`, `LICENSE`, `data/countries/IL.yaml` and `date-holidays-parser/src/{Hebrew.js,internal/hebrew-calendar.js}`. I called `new Holidays('IL').getHolidays(year)` and `isHoliday(date)`. Cited as **[DH]**.
- **`@hebcal/core` 6.14.2** (with `@hebcal/hdate` 0.23.1 and `@hebcal/noaa` 0.12.4), installed from npm. I read its `package.json`, `LICENSE` and `dist/esm/event.d.ts` (the `flags` enum). I called `HebrewCalendar.calendar({ il: true, ... })`. Cited as **[HC]**.
- **Hebcal REST API** docs at <https://www.hebcal.com/home/195/jewish-calendar-rest-api>, plus one live call: `GET https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&mod=on&i=on&start=2026-09-01&end=2026-10-10`. Cited as **[API]**.
- **GPL FAQ** at <https://www.gnu.org/licenses/gpl-faq.html>, entries `#IfLibraryIsGPL` and `#UnreleasedMods`, plus the FSF license list for Expat/MIT at <https://www.gnu.org/licenses/license-list.html#Expat>. Cited as **[FSF]**.
- **2026 Knesset election date:** Israel Hayom, [“Israel's next official election date set”](https://www.israelhayom.com/2026/07/12/israels-next-official-election-date-set) (2026-07-12). It reports that the Knesset House Committee affirmed **Tuesday 2026-10-27**. Cited as **[ELEC]**.
- **Time zone behaviour** was observed with Node's built-in `Intl.DateTimeFormat` for `Asia/Jerusalem` (ICU tzdata bundled with Node 24.12). Cited as **[TZ]**.

## TL;DR

- **Both libraries agree.** I derived "yom tov + erev + Yom HaAtzmaut" from `date-holidays` and from `@hebcal/core`. The two sets came out **identical for every year from 2026 to 2099** (1184 dates each). The library choice is about licence and ergonomics, not correctness.
- **Neither library has an explicit "erev chag" for every chag.** In both, the simple rule "**the day before a yom tov is erev chag**" yields the right set. Exclude Yom HaAtzmaut from that rule: the day before it is Yom HaZikaron, a working day.
- **Both separate yom tov from chol hamoed.** `date-holidays` uses `type: 'public'` vs `type: 'school'`. `@hebcal/core` uses the flags `CHAG` vs `CHOL_HAMOED`.
- **Yom HaAtzmaut is a non-working day.** `date-holidays` marks it `public`. Hebcal flags it `MODERN_HOLIDAY` (not `CHAG`), so it has to be added by name.
- **Election days are not reliably covered by either library.** `date-holidays` lists them only up to 2021-03-23, so it misses 2022-11-01 and 2026-10-27. Hebcal has none. **The 2026 election is on 2026-10-27, 15 days from now** [ELEC]. Whatever source we pick needs a small **config list of extra non-working dates**.
- **Licence:** `date-holidays` is ISC for the code and CC BY-SA 3.0 for the data (`package.json` says `CC-BY-3.0`; the `LICENSE` file says BY-**SA**). That is fine anywhere. `@hebcal/core` and its dependency `@hebcal/hdate` are **GPL-2.0-or-later**. Using them server-side only is allowed. Bundling them into the browser frontend would make the served bundle a GPL work. Avoid Hebcal: it adds licence questions without adding any dates.
- **Offline:** both libraries compute locally with no network access, so they work behind the VPN. `date-holidays` covers the Hebrew calendar **through 2100** from a precomputed table. Hebcal computes the calendar arithmetically and has no practical horizon. The **Hebcal REST API needs internet access**, which a VPN-gated cluster may not have. It adds nothing that the libraries lack.
- **Granularity:** whole days are enough. The decision already makes Friday and erev chag *whole* non-working days, so no partial days remain to model.
- **Time zone:** day boundaries are midnight in **`Asia/Jerusalem`**, computed with `Intl`. Never use the server's local zone, which is usually UTC in a container.

**Recommendation:** use **`date-holidays` (`IL`) in the backend**, plus an **`extraNonWorkingDays` config list** for election days and one-off closures. Take yom tov from `type === 'public'`. Take erev chag as "the day before a public holiday", except before Yom HaAtzmaut. Count whole days, with boundaries at midnight `Asia/Jerusalem`. Details are [below](#recommendation).

## The data each source returns

### `date-holidays` (`IL`)

The IL rules live in `data/countries/IL.yaml` [DH]. Each holiday has a `type`:

| `type`       | IL entries (abridged)                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public`     | Rosh Hashanah (both days), Yom Kippur, Sukkot, Simchat Torah/Shmini Atzeret, Pesach (15 Nisan), "Mimouna, Seventh day of Passover" (21 Nisan), Yom HaAtzmaut, Shavuot, Election Day (dated entries) |
| `school`     | Chol hamoed Sukkot (`16 Tishrei P6D`), chol hamoed Pesach (`16 Nisan P5D`), Hanukkah, Purim, Fast of Esther, Lag BaOmer                                       |
| `observance` | Yom HaZikaron, Yom HaShoah, Tisha B'Av, Tzom Gedaliah, Rabin Day, Jerusalem Day, Herzl Day, Sigd, etc.                                                      |

The library's output for 2026, `public` entries only:

```
2026-04-02 public פסח
2026-04-08 public מימונה, שביעי של פסח
2026-04-22 public יום העצמאות
2026-05-22 public שבועות
2026-09-12 public ראש השנה
2026-09-13 public ראש השנה יום 2
2026-09-21 public יום כיפור
2026-09-26 public סוכות
2026-10-03 public שמחת תורה/שמיני עצרת
```

Chol hamoed comes back as a single **multi-day `school` entry**, so it is easy to ignore. For example, `2026-09-27 school חול המועד סוכות` covers 2026-09-26T15:00Z through 2026-10-02T15:00Z.

- **Erev chag:** there are **no erev entries** in `IL.yaml`.
- **Yom tov vs chol hamoed:** yes, `public` vs `school`.
- **Yom HaAtzmaut:** `public`, with the official postponement rules encoded: `5 Iyyar if Friday,Saturday then previous Thursday if Monday then next Tuesday`. The output (2026-04-22 and 2027-05-12) matches Hebcal.
- **Yom HaZikaron:** `observance`, with the note "business as usual". This matches the decision that it is a working day.
- **Election days:** hard-coded dates `2015-03-17`, `2019-04-09`, `2019-09-17`, `2020-03-02` and `2021-03-23` only. **2022-11-01 and 2026-10-27 are missing.**
- **Gotcha: Hebrew-calendar days start at 18:00 the previous evening.** `Hebrew.js` builds `start: cdate.setOffset(-6, 'h')` and the date string `'... -0600'`. For example, Yom Kippur 2026 has `start: 2026-09-20T15:00:00Z`, which is 18:00 IDT on erev. So `isHoliday(new Date('2026-09-20T20:00+03:00'))` returns Yom Kippur. **Use the civil `date` field (first 10 characters), not `isHoliday()` or `start`/`end`**, to build a set of days.
- **Horizon:** the Hebrew calendar is a precomputed table, `internal/hebrew-calendar.js`, covering Gregorian **1968 to 2100**. 2100 is only partial: `getHolidays(2100)` returned no public holidays. That leaves about 74 years of headroom.
- **Offline:** pure computation from bundled data, with no network access.
- **Licence:** `package.json` says `"(ISC AND CC-BY-3.0)"`. The `LICENSE` file says the code is ISC and that "the data contained in `holidays.yaml` is available under **CC BY-SA 3.0**", with attribution in the file. The runtime dependencies are `date-holidays-parser` (ISC), `js-yaml`, `lodash` and `prepin`. All of these are permissive and compatible with an MIT repo.

### `@hebcal/core`

Events carry bit flags (`dist/esm/event.d.ts`) [HC]. The relevant ones are `CHAG` ("Chag, yontiff, yom tov"), `EREV` ("Evening before a major or minor holiday"), `CHOL_HAMOED`, `MODERN_HOLIDAY` ("Yom HaShoah, Yom HaAtzma'ut, ...") and `IL_ONLY`/`CHUL_ONLY`. Pass `il: true` for the Israeli schedule.

The output for Tishrei 5787 (2026) with `il: true`:

```
2026-09-11 Fri | Erev Rosh Hashana         | LIGHT_CANDLES,EREV
2026-09-12 Sat | Rosh Hashana 5787         | CHAG,LIGHT_CANDLES_TZEIS
2026-09-13 Sun | Rosh Hashana II           | CHAG,YOM_TOV_ENDS
2026-09-20 Sun | Erev Yom Kippur           | LIGHT_CANDLES,EREV
2026-09-21 Mon | Yom Kippur                | CHAG,YOM_TOV_ENDS,MAJOR_FAST
2026-09-25 Fri | Erev Sukkot               | LIGHT_CANDLES,IL_ONLY,EREV
2026-09-26 Sat | Sukkot I                  | CHAG,YOM_TOV_ENDS,IL_ONLY
2026-09-27 Sun | Sukkot II (CH''M)         | IL_ONLY,CHOL_HAMOED
...
2026-10-02 Fri | Sukkot VII (Hoshana Raba) | LIGHT_CANDLES,CHOL_HAMOED
2026-10-03 Sat | Shmini Atzeret            | CHAG,YOM_TOV_ENDS,IL_ONLY
```

- **Erev chag: only partly flagged.** Erev Rosh Hashana, Erev Yom Kippur, Erev Sukkot, Erev Pesach and Erev Shavuot have `EREV`. The day before **Shmini Atzeret** (Hoshana Raba) and the day before **Pesach VII** (Pesach VI) are only `CHOL_HAMOED` + `LIGHT_CANDLES`, with no `EREV`. Meanwhile `EREV` also marks days we would not treat as erev chag, such as Erev Purim, Erev Tish'a B'Av and the first Chanukah candle. So `EREV` can't be used directly. The rule "day before a `CHAG`" gives the right answer.
- **Yom tov vs chol hamoed:** yes, `CHAG` vs `CHOL_HAMOED`.
- **Yom HaAtzmaut / Yom HaZikaron:** both are `MODERN_HOLIDAY`, so they are indistinguishable by flag. Yom HaAtzmaut must be added by name (`"Yom HaAtzma'ut"`). The postponement rules match `date-holidays` (2026-04-22, 2027-05-12).
- **Election days:** not present.
- **Horizon:** the calendar is computed arithmetically. `HebrewCalendar.calendar({ year: 2100, il: true })` returned all the chagim.
- **Offline:** yes. The `@hebcal/noaa` dependency only computes sunrise and sunset locally, for zmanim we don't need.
- **Licence:** `@hebcal/core` and `@hebcal/hdate` are **GPL-2.0-or-later**, `@hebcal/noaa` is LGPL-2.1 and `quick-lru` is MIT. See [GPL in an MIT repo](#gpl-in-an-mit-repo).

### Hebcal REST API

`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&mod=on&i=on&year=…` [API]. Items carry `date` (YYYY-MM-DD for all-day items), `category`, `subcat` (`major`, `modern`, …) and **`yomtov: true` on yom tov days**. `i=on` selects the Israel schedule. The live call for September and October 2026 returned the same days as `@hebcal/core`: `yomtov: true` on Rosh Hashana I/II, Yom Kippur, Sukkot I and Shmini Atzeret; chol hamoed without `yomtov`; and "Erev …" items with the same gaps (no erev item for Hoshana Raba). This is expected, because the API is built on the same Hebcal code.

- The docs state no rate limit. The content licence is "**Creative Commons Attribution 4.0**", which requires credit to Hebcal.com.
- **It needs outbound internet access.** That is a new dependency for a VPN-gated cluster, and a failure mode to handle (caching, a stale calendar). The local library gives the same data without it.

### Static list in config

A hand-maintained list of dates such as `nonWorkingDays: ['2026-09-11', ...]`:

- Covers anything, including elections and one-off closures. No dependency, no licence question.
- About 16 dates a year (the 2026 set below), of which roughly 9 fall on Sunday to Thursday. **Someone has to update it every year.** If nobody does, Waiting Time quietly becomes wrong after the last listed date. Nothing fails loudly.

## Derived non-working set, 2026–2027 (excluding ordinary Fri/Sat)

The derivation rule:

1. yom tov: `date-holidays` `type === 'public'`, or hebcal `CHAG`;
2. plus Yom HaAtzmaut;
3. plus the day before each yom tov (not before Yom HaAtzmaut).

Both libraries produce exactly this list, and they also match for every year from 2026 to 2099:

| Date       | Day | What                       |
| ---------- | --- | -------------------------- |
| 2026-04-01 | Wed | Erev Pesach                |
| 2026-04-02 | Thu | Pesach I                   |
| 2026-04-07 | Tue | Erev Pesach VII (chol hamoed day 6) |
| 2026-04-08 | Wed | Pesach VII                 |
| 2026-04-22 | Wed | Yom HaAtzmaut              |
| 2026-05-21 | Thu | Erev Shavuot               |
| 2026-05-22 | Fri | Shavuot                    |
| 2026-09-11 | Fri | Erev Rosh Hashana          |
| 2026-09-12 | Sat | Rosh Hashana I             |
| 2026-09-13 | Sun | Rosh Hashana II            |
| 2026-09-20 | Sun | Erev Yom Kippur            |
| 2026-09-21 | Mon | Yom Kippur                 |
| 2026-09-25 | Fri | Erev Sukkot                |
| 2026-09-26 | Sat | Sukkot I                   |
| 2026-10-02 | Fri | Erev Shmini Atzeret (Hoshana Raba) |
| 2026-10-03 | Sat | Shmini Atzeret / Simchat Torah |
| *2026-10-27* | *Tue* | *Knesset election day (config only; neither library has it) [ELEC]* |
| 2027-04-21 | Wed | Erev Pesach                |
| 2027-04-22 | Thu | Pesach I                   |
| 2027-04-27 | Tue | Erev Pesach VII            |
| 2027-04-28 | Wed | Pesach VII                 |
| 2027-05-12 | Wed | Yom HaAtzmaut              |
| 2027-06-10 | Thu | Erev Shavuot               |
| 2027-06-11 | Fri | Shavuot                    |
| 2027-10-01 | Fri | Erev Rosh Hashana          |
| 2027-10-02 | Sat | Rosh Hashana I             |
| 2027-10-03 | Sun | Rosh Hashana II            |
| 2027-10-10 | Sun | Erev Yom Kippur            |
| 2027-10-11 | Mon | Yom Kippur                 |
| 2027-10-15 | Fri | Erev Sukkot                |
| 2027-10-16 | Sat | Sukkot I                   |
| 2027-10-22 | Fri | Erev Shmini Atzeret (Hoshana Raba) |
| 2027-10-23 | Sat | Shmini Atzeret / Simchat Torah |

Notes:

- **Rosh Hashana II:** the "day before" rule hits Rosh Hashana I, which is already non-working. No special case is needed.
- **Chol hamoed stays working**, as decided. The only exception is its last day, which is erev Pesach VII or Hoshana Raba and so becomes non-working.
- **Yom HaAtzmaut is included even though it is not a yom tov.** It is a statutory day off and `date-holidays` marks it `public`, so excluding it would surprise the team. Its eve, Yom HaZikaron, stays working. If the team disagrees, it is one name in a filter.
- **Days that stay working:** Purim, Tisha B'Av, Yom HaShoah, Lag BaOmer, Hanukkah and the minor fasts.

## GPL in an MIT repo

I'm not a lawyer. These are the relevant FSF statements [FSF]:

- **A program that uses a GPL library:** "the terms of the GPL apply to the entire combination" (`#IfLibraryIsGPL`). Our own source can stay MIT, because MIT/Expat is listed as GPL-compatible. But **any distributed artifact that includes Hebcal**, such as a published Docker image, is a GPL combined work and must be shipped on GPL terms, with source.
- **Server-side only:** "The GPL permits anyone to make a modified version and use it without ever distributing it to others" (`#UnreleasedMods`). GPLv2 has no network clause (unlike the AGPL), so running it in our backend triggers nothing. We still publish the repo, and possibly an image.
- **Bundled into the frontend:** serving JavaScript to browsers *is* distribution. Per `#UnreleasedMods`, when a site distributes GPL programs to visitors, "the source code for the programs being distributed must be released to the user under the terms of the GPL." The served bundle would effectively be GPL.

**Net:** allowed, especially server-side. But it puts a GPL obligation on a MapColonies MIT project and buys nothing, because `date-holidays` produces the same dates. Prefer `date-holidays`.

## Partial days

The decision already treats **Friday and erev chag as whole non-working days**, so no "half day" is left to model. I recommend **whole-day granularity**: a working day contributes its full 24 hours of wall-clock time, and a non-working day contributes 0.

Modelling working hours (for example 09:00–18:00) would add config and edge cases: different hours per person, and erev chag ending at 13:00. That gives little benefit for urgency thresholds of 1, 2 and 5 days. If wanted later, it fits behind the same "how much working time between A and B" function.

## Time zone

- Day boundaries are **midnight `Asia/Jerusalem`**. `date-holidays` declares `zones: [Asia/Jerusalem]` for IL [DH]. GitHub timestamps are UTC, and the backend container is usually UTC too. So always convert explicitly, for example with `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' })` to get the civil `YYYY-MM-DD`. Never rely on `Date#getDay()` or the process's `TZ`.
- **DST:** with Node's tzdata [TZ], Israel springs forward early on a **Friday** (2026-03-27, 2027-03-26), which is non-working anyway. It falls back on a **Sunday** (2026-10-25, 2027-10-31), so that working day is **25 hours long**. Compute working time as "the sum over working days of the overlap between [since, now] and [local midnight, next local midnight]". Don't assume 24 h × days, and this edge case handles itself.
- Holiday dates from either library are civil dates with no time-of-day. Use the `YYYY-MM-DD` date and ignore `date-holidays`' 18:00-previous-evening `start` (see the gotcha above).

## Recommendation

**Use `date-holidays` (country `IL`) in the backend, plus a config list of extra non-working dates.**

1. **Working-day predicate:** a civil date (in `Asia/Jerusalem`) is non-working if any of these holds:
   - it is a Friday or Saturday;
   - it is a `date-holidays` IL holiday with `type === 'public'`;
   - it is the day before such a holiday, unless that holiday is Yom HaAtzmaut;
   - it is in `extraNonWorkingDays` from config.
2. **Config `extraNonWorkingDays`** (ISO dates), initially `['2026-10-27']` for the election. This also covers office closures and future elections that the library will lag on.
3. **Working time** between two instants is the sum of their overlap with each working day's [00:00, 24:00) in `Asia/Jerusalem`. The 1, 2 and 5 working-day urgency levels are 24 h, 48 h and 120 h of that.
4. **Compute it in the backend** and send working-time values (plus wall-clock values for the hover) to the frontend. Then the frontend carries no calendar dependency and only one place owns the rule.

Why this option:

- It is offline, so VPN is not an issue.
- The licence is permissive.
- It computes up to 2100.
- Yom tov and chol hamoed are already separated by `type`.
- It gives exactly the same dates as Hebcal.

The only manual upkeep is adding election days and similar dates to config.

## Not checked / open

- I did not compare these days against an official Israeli civil-service calendar (for example the Ministry of Labour's list of rest days). Agreement between the two libraries was taken as enough.
- Whether `date-holidays` will add the 2026 election before 2026-10-27 is unknown. The config list makes that irrelevant.

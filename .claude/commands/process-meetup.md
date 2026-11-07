Process a meeting transcript into a full event report, Hugo landing page, and update the questions backlog.

## Input

The user provides:
- Path to transcript file (e.g. `transcript_20260522_123321_92d1f3b3.txt`)
- Meeting date (e.g. `21-05-2026`)
- Optional: when the recording started, with time zone. Google Meet filenames carry it,
  e.g. `pxm-dwce-qhn (2026-11-05 19_15 GMT+5).mp4` → 19:15 GMT+5. Needed for Step 4c.

If transcript or date is not provided, ask the user for both.

## Step 1: Read reference materials

Read in parallel:
1. The transcript file
2. The most recent event report from `2026/events-reports/` (find the latest `report.md`)
3. The most recent Hugo content page from `landing-main/content/events/` (find the latest `.md` file, not `_index.md`)
4. The Hugo layout at `landing-main/layouts/events/single.html`
5. The OG image partial at `landing-main/layouts/partials/og-image.html`

These give you the exact format to follow.

## Step 2: Analyze the transcript

Read the full transcript. It's a raw speech-to-text dump of a community meetup in Russian. Identify:

- **Main topic** – the overarching theme of the meeting
- **Participants** – names and their roles/positions in the discussion. Look for how people introduce themselves or are addressed. **Validate names against previous events:** scan all existing `landing-main/content/events/meetup-*.md` files and collect every unique participant name from `participants:` frontmatter. If a name in the new transcript matches an existing participant, use the exact same spelling. If there's a close but not exact match (e.g. "Вася" vs "Василий", "Миша" vs "Михаил"), ask the user which form to use. If a completely new name appears, confirm it with the user.
- **Subtopics** – distinct discussion threads (typically 4–8)
- **Differing opinions** – where participants disagreed, with their positions
- **Key takeaways** – consensus points and unresolved conclusions
- **Open questions** – topics proposed for future discussion or left unresolved

## Step 3: Create the event report

Create `2026/events-reports/meetup-YYYY-MM-DD/report.md` following the exact structure of the reference report:

```
# Встреча сообщества – DD месяц YYYY

## Основная тема
## Участники
## Подтемы и их суть
### 1. ...
### 2. ...
## Параллельно в чате        (only if Step 4c found something – see there)
## Различные мнения (table)
## Основные выводы
## Вопросы для дальнейшего обсуждения
```

## Step 4: Create the Hugo content page

Create `landing-main/content/events/meetup-YYYY-MM-DD.md`. The file is **frontmatter only – no HTML, no Markdown body**. All content lives in structured YAML fields; the layout (`layouts/events/single.html`) renders them, and the OG image generator (`layouts/partials/og-image.html`) reads `topics` titles. Do not write a content body.

### Frontmatter (YAML)
```yaml
---
title: "Встреча сообщества – DD месяц YYYY"
description: "Short SEO description with key topics, comma-separated"
date: YYYY-MM-DD
audio: "https://storage.yandexcloud.net/<bucket>/meetup-YYYY-MM-DD.opus"  # optional – only if a recording is published (see Step 4b)
mainTopic: "Full sentence describing the main topic."
cardTitle: "Short homepage card title"
cardDesc: "Homepage card description, comma-separated topics"
tags: ["tag1", "tag2", "tag3"]
participants:
  - name: Name
    role: "Short role description"
  - name: Name2
nextQuestions:
  - question: "Open question text"
  - question: "Another open question"
# --- structured body content (rendered by the layout) ---
topics:                     # «Подтемы и их суть» – numbered automatically (1., 2., ...)
  - title: "Subtopic title"
    start: 0                 # optional – seconds into the recording; renders a chapter + "jump to audio" (see Step 4b)
    body: "One factual paragraph describing the subtopic."
  - title: "Second subtopic"
    start: 624
    body: "..."
opinions:                   # «Различные мнения» – the "Вопрос" column is implicit
  columns: ["Андрей", "Василий", "Уалихан"]   # 3–5 participant names
  rows:
    - question: "Point of disagreement?"
      values: ["Position A", "Position B", "–"]   # one value per column; use "–" if silent
takeaways:                  # «Основные выводы»
  - title: "Takeaway title"
    body: "Conclusion paragraph."
  - title: "Final takeaway"
    body: "..."
    wide: true              # optional – renders a full-width card (use on the last one)
---
```

Rules for the structured fields:
- `topics` are numbered automatically by the layout – do **not** prefix titles with `N.`
- `opinions.values` must have exactly one entry per name in `opinions.columns`; use `"–"` when a participant didn't weigh in
- Set `wide: true` on at most one takeaway (typically the last) for the full-width card
- Use « » (guillemets) for quotes and – (en-dash) in all strings, same as elsewhere
- Optional `chat:` block and `chat: <thread-id>` on topics – see Step 4c
- After creating the file, run `hugo --quiet` in `landing-main/` to confirm it builds cleanly

## Step 4b: Audio player + timestamped transcript (when a recording exists)

If the meeting has a published recording, wire up the listen-along player. Skip this
step entirely if there's no audio to publish – the layout degrades gracefully (no
`audio:` → no player).

1. **Get a timestamped transcript.** Run `/transcribe-video` with the Yandex provider
   on the compressed audio (see that skill's "Timestamped transcript" section):
   ```
   scribe transcribe '<stem>.opus' --provider yandex --language ru \
     -o '<stem>.transcript.json'
   ```
   This uploads the audio to Object Storage **and** returns the normalized JSON
   `{ audio, duration, segments:[{t,end,text}], text }`.

2. **Place the transcript** where the layout fetches it (path is by convention –
   `/audio/<page-base-name>.transcript.json`):
   ```
   cp '<stem>.transcript.json' landing-main/static/audio/meetup-YYYY-MM-DD.transcript.json
   ```
   Keep only `{duration, segments}` (the `audio`/`text` keys are harmless but unused by
   the player). Do **not** commit large media – only this JSON lives in the repo; the
   `.opus` stays in Object Storage.

3. **Set `audio:`** in the content page's frontmatter to the storage URL returned in the
   JSON's `audio` field (the same object the player streams).

4. **Add `start:` to each `topics` entry** – the second-offset where that subtopic
   begins, so it becomes a clickable chapter + a "▶ jump" link on the topic block.
   Derive each `start` by finding the first transcript segment whose `text` matches the
   topic's opening idea, and use that segment's `t` (rounded to a whole second). Topics
   are in the same order as the discussion, so starts must increase monotonically.

5. Run `hugo --quiet` and confirm the rendered page contains `data-audio-player` and one
   `ap-chapter` per topic with a `start`.

## Step 4c: Link the meeting with the community chat

The chat (`t.me/teamleads_kz`, public) keeps running during the call: people post the
slides or photos they mention, links, and side threads. Always check it – speakers
often say «я скину в чат», «вот фотки слайдов», «Никита в чате спрашивает».

1. **Fetch the window.** Recording start → end, plus ~15 min on each side, in UTC
   (19:15 GMT+5 = 14:15Z). No DB access or login needed – the script reads the public
   t.me embed and finds message ids by date:
   ```bash
   cd landing-main && node scripts/chat-window.mjs \
     --from 2026-11-05T14:00Z --to 2026-11-05T16:30Z \
     --photos <scratchpad>/chat-photos > <scratchpad>/chat.jsonl
   ```
   Output: one JSON line per message `{id, dt, author, reply, text, photos, link}`.
   An album is several consecutive messages, one photo each, so each photo has its
   own link. Look at the photos (Read them; tile with ffmpeg if many) – OCR or read
   slide titles to caption them.

2. **Calibrate the clock.** The filename time is when the Meet room was set up, not
   when recording began (5 Nov: filename 19:15, recording actually ~19:18). Find a
   remark in the transcript that refers to a specific chat message («Никита в чате
   спрашивает, сидим ли мы» at 82:44 ↔ message at 15:40:44Z) and derive
   `recording_start = message_time − offset`. Then every message maps to a minute
   of the recording: `offset = message_time − recording_start`.

3. **Pick what belongs.** Keep messages that the conversation references or that
   run in parallel on the same subject (photos of slides someone talks about, a link
   that feeds the security discussion). Drop small talk, bot digests (`#итогидня`)
   and anything personal: disputes or accusations about named people stay out even
   if the call touched them – ask the user when unsure.

4. **Report** (`report.md`): add a `## Параллельно в чате` section after «Подтемы»:
   local time (GMT+5) and ≈ minute of the recording per thread, which subtopic it
   belongs to, a table of photos with captions + message links, and bullet lists of
   messages as `[71568](https://t.me/teamleads_kz/71568) – Автор: суть`. Save photos
   to `2026/events-reports/meetup-YYYY-MM-DD/photos/<id>-<slug>.jpg` and embed them
   as `![](photos/<id>-<slug>.jpg)`. Inside subtopic text, link the message inline
   where it is mentioned.

5. **Site page:** copy the same photos to
   `landing-main/static/images/events/meetup-YYYY-MM-DD/` and add a `chat:` block
   (rendered by `layouts/partials/report/chat.html` as «Параллельно в чате», with a
   contents entry):
   ```yaml
   chat:
     intro: "Пока шел звонок, в чате … Время местное (GMT+5), запись началась около 19:18."
     threads:
       - id: slides                      # anchor #chat-slides
         title: "Слайды доклада …"
         time: "20:23"                   # local time, free text
         start: 3917                     # optional – seconds into the recording, ▶ seek button
         note: "Who posted what and where the call refers to it."
         photos:
           - { src: "/images/events/meetup-YYYY-MM-DD/71548-title.jpg", id: 71548, caption: "Титул доклада" }
       - id: sshhole
         title: "…"
         time: "20:46–21:09"
         messages:
           - { id: 71568, author: "LSTR Unit", text: "Short paraphrase or quote" }
   ```
   On each related topic add `chat: <thread id>` – it renders «↓ В чате: <title>».
   Message links are built from `site.Params.telegram` + `/<id>`. Thread `start`
   only seeks when the page has `audio:`.

6. `hugo --quiet`, then check the built page has one `chat-photo` per photo, the
   message links and the `topic-chat-link`s.

Skip the step (no section, no `chat:`) when nothing relevant was posted.

## Step 5: Homepage and OG image (auto-generated)

The homepage events grid and OG images are auto-generated by Hugo from frontmatter fields. No manual edits to `index.html` are needed. Just ensure the Hugo content page has correct `cardTitle`, `cardDesc`, and `tags` fields (see Step 4).

## Step 6: Extend the simulator deck

The shell-mode `sim` command (Тимлид-симулятор) is grown from the dilemmas surfaced in meetings. Mine this meeting for **1–3** decision cases and append them to `landing-main/data/scenarios.yaml`.

Follow the schema and quality gate in `landing-main/data/SCENARIOS.md`. In short:
- **Best material:** the `opinions` rows (each explicit disagreement is a ready-made fork) and `takeaways` (reverse-engineer the dilemma a takeaway resolves). `nextQuestions` are usually too open-ended.
- **Only add a scenario when there's a real choice** with a defensible best answer and *tempting* wrong options. A meeting with no genuine dilemma adds nothing – that's a valid outcome.
- **Read the existing `scenarios.yaml` first** and skip themes already covered (bus-factor, навязанные решения, метрики, «наслабо», ответственность джуна, …) unless the angle is genuinely new.
- Each scenario: unique `id` (`meetup-YYYY-MM-DD-<theme>`), 2-line anonymized `prompt` (second person, «вы»), 3 `options` – exactly one `good: true` and an `outcome` per option (**no `votes`** – answer counts are real and come from the backend; the validator rejects the field) – a one-line `lesson`, and `link: "events/meetup-YYYY-MM-DD"` (the page you just created).
- En-dashes (–), guillemets « », no real names.

Append to the **end** of `scenarios:` (don't reorder existing), then validate from `landing-main/`:

```bash
hugo --quiet && node scripts/validate-scenarios.mjs
```

Fix anything the validator flags (an invented `votes` field, missing/extra good option, unresolved link, duplicate id, em-dashes). Report which scenarios you added – or that none fit – in the final summary.

## Step 7: Review and update the questions backlog

This is critical. Scan ALL existing event files in `landing-main/content/events/meetup-*.md`:

1. Collect every `nextQuestions` entry that does NOT have `answeredIn`
2. For each open question, check if the new meeting's transcript substantively discussed that topic
3. If a match is found, update the older event file by adding `answeredIn: "meetup-YYYY-MM-DD"` to that question entry
4. Present the user with a summary: which questions were matched and which were left open

Be conservative: only mark a question as answered if the meeting genuinely addressed that specific topic, not just tangentially mentioned it.

## Formatting rules

- Always use en-dashes (–) instead of em-dashes (—) in all content
- Use « » (guillemets) for Russian quotation marks in all content strings
- Keep topic descriptions factual and neutral – report what was said, not your interpretation
- Participant roles should be concise (3–6 words)
- SEO description should be under 160 characters
- nextQuestions should be phrased as discussion topics, not yes/no questions

## Step 8: Summary

After creating both files and updating questions, present a summary:
- Event date and main topic
- Number of subtopics covered
- Audio player: whether a recording + timestamped transcript was published, and how many topics got `start:` chapters (or "no recording")
- Number of participants identified
- Parallel chat: threads linked, photos saved, which topics point to them, the calibrated recording start – and what was left out on purpose (or "nothing relevant in chat")
- Simulator scenarios added to the deck (ids + one-line each), or "none – no genuine dilemma"
- Questions answered from previous meetings (if any)
- New open questions added
- Remind the user that OG image is auto-generated by Hugo at build time from topic headers

Ask the user to review the files before committing.

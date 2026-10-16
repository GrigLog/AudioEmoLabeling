# Audio Emotion Labeling

A browser app for labeling **speakers** and **emotions** in long speech recordings (hours, with several consultants and dozens of clients). It produces training data for emotional speech diarization.

- **Emotions:** positive · neutral · angry · sad · unclear
- **Speakers:** consultant / client / unclear, each with an **optional** instance number ("Client", "Client 3", "Consultant 2")
- An **optional transcript** shows what is being said, lets you create spans from lines, and prefills span text for you to correct.
- Spans may **overlap** (people talking at once); overlapping spans are drawn in separate lanes.
- Everything runs locally in the browser. Audio is never uploaded.

## Running it

**No installation.** The app is a single self-contained `index.html`:

- **Online:** open the GitHub Pages URL of this repository.
- **Offline:** download `index.html` (from the Pages site: *Save page as…*, or build it as described below) and double-click it. This works in Chrome, Edge, Firefox and Safari on Windows, macOS and Linux.

Chrome or Edge is recommended. Only they can write the labels file in place and reopen recent sessions in one click. In Firefox and Safari, *Save* downloads the file instead.

## Workflow

1. Drop the **WAV** onto the page. Optionally drop the **transcript JSON** and/or an existing **labels JSON** too, all at once or one by one; the app works out which file is which.
2. Label:
   - **Live (fastest):** press <kbd>Space</kbd> and leave **Follow** on. While you listen, press a speaker key (<kbd>Q</kbd> consultant, <kbd>W</kbd> client, <kbd>E</kbd> unclear) and an emotion key (<kbd>1</kbd>–<kbd>5</kbd>). They apply to the span under the playhead. If only a transcript line is there, a span is created from that line. If you press a key just after a span ended and that span still lacks that label, the key goes to it.
   - **New customer?** <kbd>Shift</kbd>+<kbd>W</kbd> creates the next numbered client and makes it current. For a returning client, press <kbd>S</kbd> and type `c3`. A Russian keyboard layout works too, so `с3` gives the same result.
   - **Mark spans:** press <kbd>Enter</kbd> when speech starts and <kbd>Enter</kbd> when it ends, or **drag** on the waveform. Drag the edges to fix boundaries. Edges snap to transcript lines, other spans and the playhead; hold <kbd>Alt</kbd> to stop snapping.
   - **Bulk:** *Create draft spans from transcript* turns every line into an unlabeled span, and <kbd>G</kbd> jumps to the next unlabeled one.
   - **Text:** <kbd>T</kbd> opens the span's text prefilled from the auto-transcript and plays the span; press <kbd>Enter</kbd> to save. Only text you saved is exported. <kbd>N</kbd> adds a free-text note.
   - **Fix:** <kbd>X</kbd> splits at the playhead, <kbd>M</kbd> merges with the next span (or merges the selected spans), <kbd>Del</kbd> deletes, and <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> undoes.
3. **Save** with <kbd>Ctrl/⌘</kbd>+<kbd>S</kbd>. In Chrome/Edge, later changes are written to the same file automatically. Work is also **autosaved in the browser** after every change, so a crash or a closed tab loses nothing. Reopening the same audio restores the session, and the start screen lists recent sessions.

Press <kbd>?</kbd> in the app for all shortcuts. Shortcuts match physical key positions, so they work with any keyboard layout. You can remap them in ⚙ Settings.

## File formats

### Transcript (input, optional)

A JSON array of `{start, end, text}` objects, with times in seconds. Extra fields are ignored except `id`, and `author`/`speaker` (shown as a hint unless it is `"unknown"`). An object with a `segments` array is accepted too.

```json
[{ "id": "s000004", "start": 33.11, "end": 34.11, "text": "Здравствуйте", "author": "unknown" }]
```

### Labels (output, also the progress file)

```json
{
  "format": "audio-emotion-labels",
  "version": 1,
  "audio": { "name": "AsrDiarize_2026-07-07_12-00.wav", "size": 115333198, "duration": 3604.16, "sampleRate": 16000, "channels": 1 },
  "transcript": { "name": "transcript_972034.json", "segments": 659 },
  "createdAt": "2026-10-16T12:45:12.570Z",
  "updatedAt": "2026-10-16T12:50:18.614Z",
  "app": "audio-emo-labeling 1.0.0",
  "progress": { "position": 43.11, "listenedUntil": 61.2, "current": { "consultant": "consultant_2", "client": "client_1", "unclear": "unclear" } },
  "speakers": [
    { "id": "consultant_2", "role": "consultant", "n": 2, "name": "woman at desk 2" },
    { "id": "client", "role": "client", "n": null },
    { "id": "client_1", "role": "client", "n": 1 }
  ],
  "segments": [
    { "id": "aynwqd01jdj", "start": 33.11, "end": 34.11, "speaker": "client", "emotion": "neutral" },
    { "id": "ayqrg8017ox", "start": 40.11, "end": 43.11, "speaker": "consultant_2", "emotion": "angry",
      "text": "Проводной или на телефоне?", "note": "irritated tone" }
  ]
}
```

- Times are in seconds, rounded to milliseconds. Segments are sorted by `start` and may overlap.
- `speaker` is `<role>` or `<role>_<n>`, where role is `consultant`, `client` or `unclear`. The `speakers` table repeats `role` and `n` (`null` means no number) and holds optional nicknames.
- `emotion` is `positive | neutral | angry | sad | unclear`.
- `speaker`/`emotion` are `null` on spans not labeled yet. `text` (labeler-written) and `note` appear only when set.
- There is one segment per line, so files stay readable and diff well.

## Development

Requires Node.js ≥ 22.12.

```bash
npm install
```

```bash
npm run dev
```

The dev server runs at <http://localhost:5173>. `/?demo` loads `AsrDiarize_2026-07-07_12-00.wav` and `transcript_972034.json` from the project folder; `?demo=<file.wav>&transcript=<file.json>` picks other files.

```bash
npm test
```

```bash
npm run check
```

```bash
npm run build
```

`npm run build` writes the single-file app to `dist/index.html`.

Stack: Svelte 5 and TypeScript, built with Vite into a single HTML file via `vite-plugin-singlefile`, with the waveform worker inlined. Playback uses a plain `<audio>` element streaming from the file, so multi-hour WAVs are never fully decoded into memory. Peaks are computed in a worker with 8 MB reads and cached in IndexedDB, and deep zoom reads raw samples on demand.

### Deploying to GitHub Pages

Push to `main`. `.github/workflows/deploy.yml` type-checks, tests, builds and publishes `dist/`. In the repository settings, set **Pages → Source** to **GitHub Actions** once.

> Recordings (`*.wav`), transcripts (`transcript_*.json`) and labels (`*.labels.json`) are in `.gitignore`. They are large, private data and must not be committed. GitHub also rejects files over 100 MB.

### Code map

| Path | What |
|---|---|
| `src/lib/audio/` | WAV parsing, streaming peaks (worker), raw-sample cache, `<audio>` player |
| `src/lib/model/` | Types, speaker ids, span operations, overlap lanes, undo history |
| `src/lib/io/` | Labels file (build/serialize/validate), transcript parsing and index, file pickers/saving, IndexedDB autosave |
| `src/lib/app.svelte.ts` | Application state and all actions (labeling, navigation, loading, saving) |
| `src/lib/keys.ts`, `actions.ts` | Keymap (physical keys) and what each action does |
| `src/lib/timeline/` | Viewport math and canvas rendering / hit testing |
| `src/components/` | UI (start screen, top bar, timeline, inspector, side panels, dialogs) |
| `tests/` | Vitest unit tests |

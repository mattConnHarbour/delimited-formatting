# Delimited formatting

A standalone React demo of plain-text review formatting with SuperDoc. Underline additions and retain deletions with strikethrough across the document, inside content controls, or between `[[format]]` and `[[/format]]` markers. Export the result as DOCX with ordinary formatting.

## Run it

Requires Node 22.12 or newer and pnpm 11.

```bash
pnpm install
pnpm dev
```

Open the printed URL. When the document is ready, edit its text and choose **Export DOCX**.

Choose **Add SDT** to insert an editable block rich-text content control after the current paragraph, or at the end if no caret is set. The editor scrolls to the new control and focuses it. Each click adds a separate control, which is included in the exported DOCX.

Choose where automatic formatting applies:

- **Format SDTs** underlines additions and preserves deletions with strikethrough inside SDTs. Text outside SDTs uses normal editing.
- **Format all** applies that behavior throughout the document.
- **Format between delimiters** applies it only between matched `[[format]]` and `[[/format]]` markers. Regions can span paragraphs. The markers stay unformatted, and text outside matched pairs uses normal editing. Unmatched markers do not activate formatting.
- **Format none** disables the automatic rules and uses normal editing everywhere. This is the initial mode. Existing formatting remains in place.

In **Format SDTs** and **Format all**, document updates also restore missing underline inside SDTs, including after pasting or removing formatting. The demo applies ordinary document formatting and creates no tracked-change records or review highlights. Export waits for pending edits and formatting checks before writing the DOCX.

## Verify it

```bash
pnpm typecheck
pnpm build
pnpm browsers
pnpm test
```

Unit tests cover delimiter ranges, underline detection, and editor readiness. Browser tests cover each formatting mode, rapid typing, marker boundaries, paragraph breaks, SDT insertion, paste, and exported DOCX formatting.

This demo installs the published versions declared in `package.json`.

See [Mount SuperDoc in React](https://docs.superdoc.dev/editor/frameworks/react) for the guided explanation.

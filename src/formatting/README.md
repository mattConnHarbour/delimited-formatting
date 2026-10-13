# Formatting controllers and React hooks

Copy this entire `formatting/` folder into a React application that uses `@superdoc/react`. Import the hooks from its `index.ts`. The folder contains the controllers and their shared helpers; it has no dependency on the demo UI.

| React hook               | Controller factory                    | Behavior                                                                                                                  |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `useSDTFormatting`       | `createSDTFormattingController`       | Underline additions and strike deletions inside SDTs. Restore missing SDT underline on document updates.                  |
| `useDocumentFormatting`  | `createDocumentFormattingController`  | Underline additions and strike deletions throughout the document. Also restore missing SDT underline on document updates. |
| `useDelimitedFormatting` | `createDelimitedFormattingController` | Format edits inside matched `[[format]]` and `[[/format]]` markers. Keep markers plain and edit outside normally.         |

Use one enabled hook per editor container. All three hooks accept the same options and return the same methods.

## React integration

```tsx
import { useRef, useState } from "react";
import { SuperDocEditor, type SuperDocRef } from "@superdoc/react";
import "@superdoc/react/style.css";
import { useSDTFormatting } from "./formatting";

export function Editor() {
  const editorRef = useRef<SuperDocRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const formatting = useSDTFormatting({
    editorRef,
    containerRef,
    ready,
    enabled,
  });

  async function toggleFormatting() {
    await formatting.flush();
    setEnabled((value) => !value);
  }

  async function exportDocument() {
    await formatting.flush();
    await editorRef.current?.getInstance()?.export({ exportType: ["docx"] });
  }

  return (
    <>
      <button
        disabled={!ready || formatting.isInitializing}
        onClick={() => void toggleFormatting()}
      >
        {enabled ? "Disable formatting" : "Enable formatting"}
      </button>
      <button
        disabled={!ready || formatting.isInitializing}
        onClick={() => void exportDocument()}
      >
        Export DOCX
      </button>
      {formatting.error && <p role="alert">{formatting.error.message}</p>}
      <div ref={containerRef} inert={formatting.isInitializing}>
        <SuperDocEditor
          ref={editorRef}
          document="/sample.docx"
          documentMode="editing"
          onReady={() => setReady(true)}
          onEditorUpdate={formatting.onEditorUpdate}
        />
      </div>
    </>
  );
}
```

Replace `useSDTFormatting` with either of the other hooks to change the scope. `src/App.tsx` shows how to mount all three hooks with mutually exclusive `enabled` values and switch between them.

The hooks install and remove browser listeners as `ready` and `enabled` change. `enabled` defaults to `true`. Keep the container around a single editor. Keep `documentMode="editing"` so the editor writes ordinary formatting.

| Result             | Use                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isInitializing`   | Block interaction while the initial formatting pass runs, as the example does with `inert`.                                                                                      |
| `onEditorUpdate()` | Pass to the editor's `onEditorUpdate` prop to schedule SDT underline reconciliation.                                                                                             |
| `flush()`          | Await pending edits and reconciliation before saving, disabling formatting, switching modes, replacing the document, or unmounting the editor. Rejects if the queued work fails. |
| `resetSelection()` | Call after `flush()` and before moving the caret through another API, such as inserting and focusing a new SDT.                                                                  |
| `error`            | Latest controller error, or `null` after a successful operation. Optional `onError` and `onSuccess` callbacks are also accepted.                                                 |

These browser controllers handle text input, deletion, cut, paste, and paragraph breaks through event interception. IME composition and undo/redo remain with the editor. Programmatic document mutations do not become review edits automatically; SDT underline reconciliation still runs when updates are forwarded. Use the dependency versions in the demo's lockfile as the tested baseline.

## Using controllers directly

The controller factories work without React hooks. Supply the editor's DOM container and a function that returns the current SuperDoc instance:

```ts
const controller = createDelimitedFormattingController({
  element: editorContainer,
  getInstance: () => superdocInstance,
  onError: reportError,
});
```

For SDT and document controllers, await `controller.reconcile()` on initialization and forward editor updates to it. Delimiter reconciliation is a no-op. Before exporting or changing controllers, await `controller.flush()`. Use `controller.resetSelection()` before an external caret change and `controller.destroy()` to detach listeners. Destruction is idempotent.

Each controller owns its scope decisions. `internal/input-controller.ts` handles shared input events, queued edits, caret restoration, and paragraph breaks. Delimiter typing retains the queued-input batching and insertion-map optimization.

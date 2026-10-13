import { useRef, useState } from "react";
import { SuperDocEditor, type SuperDocRef } from "@superdoc/react";
import "@superdoc/react/style.css";
import {
  useSDTFormatting,
  useDocumentFormatting,
  useDelimitedFormatting,
} from "./formatting";

type FormattingScope = "sdts" | "all" | "delimiters" | "none";

function reportDocumentError({ error }: { error: unknown }) {
  console.error("SuperDoc could not open the document.", error);
}

export default function App() {
  const editorRef = useRef<SuperDocRef>(null);
  const mainRef = useRef<HTMLElement>(null);
  const exportingRef = useRef(false);
  const addingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [changingScope, setChangingScope] = useState(false);
  const [formattingScope, setFormattingScope] =
    useState<FormattingScope>("none");
  const [sdtError, setSdtError] = useState<string | null>(null);
  const [sdtStatus, setSdtStatus] = useState<string | null>(null);
  const options = { editorRef, containerRef: mainRef, ready };
  const sdtFormatting = useSDTFormatting({
    ...options,
    enabled: formattingScope === "sdts",
  });
  const documentFormatting = useDocumentFormatting({
    ...options,
    enabled: formattingScope === "all",
  });
  const delimitedFormatting = useDelimitedFormatting({
    ...options,
    enabled: formattingScope === "delimiters",
  });
  const formatting =
    formattingScope === "sdts"
      ? sdtFormatting
      : formattingScope === "all"
        ? documentFormatting
        : formattingScope === "delimiters"
          ? delimitedFormatting
          : null;

  function onDocumentUpdate() {
    formatting?.onEditorUpdate();
  }

  async function selectFormattingScope(scope: FormattingScope) {
    setChangingScope(true);
    try {
      await formatting?.flush();
      setSdtError(null);
      setFormattingScope(scope);
    } catch (error) {
      setSdtError(
        error instanceof Error
          ? error.message
          : "Review mode could not be changed.",
      );
    } finally {
      setChangingScope(false);
    }
  }

  async function addSdt() {
    if (addingRef.current) return;
    addingRef.current = true;
    setAdding(true);
    setSdtError(null);
    setSdtStatus(null);
    try {
      const instance = editorRef.current?.getInstance();
      const documentApi = instance?.activeEditor?.doc;
      if (!instance || !documentApi)
        throw new Error("The document is not ready.");
      await formatting?.flush();
      formatting?.resetSelection();
      const selection = instance.ui.selection.getSnapshot();
      const target =
        selection.status === "ready" ? selection.selectionTarget : null;
      const receipt = await documentApi.create.contentControl({
        kind: "block",
        controlType: "richText",
        tag: `demo.block-sdt.${crypto.randomUUID()}`,
        alias: "Block SDT",
        html:
          formattingScope === "none" || formattingScope === "delimiters"
            ? "<p>Enter text in this block content control.</p>"
            : "<p><u>Enter text in this block content control.</u></p>",
        ...(target?.end.kind === "text"
          ? { at: { ...target, start: target.end, end: target.end } }
          : {}),
      });
      if (!receipt.success) throw new Error(receipt.failure.message);
      await formatting?.flush();
      setSdtStatus("Block SDT added.");
      await new Promise<void>((resolve) => {
        let unsubscribe = () => {};
        let settled = false;
        const finish = () => {
          settled = true;
          window.clearTimeout(timeout);
          unsubscribe();
          resolve();
        };
        const timeout = window.setTimeout(finish, 3_000);
        unsubscribe = instance.ui.contentControls.observe((snapshot) => {
          if (
            snapshot.items.some(
              (control) =>
                control.target.nodeId === receipt.contentControl.nodeId,
            )
          )
            finish();
        });
        if (settled) unsubscribe();
      });
      const focused = await instance.ui.contentControls.focus({
        id: receipt.contentControl.nodeId,
        behavior: "instant",
      });
      if (!focused.success)
        setSdtStatus(
          "Block SDT added. Scroll to the end of the document to edit it.",
        );
    } catch (error) {
      setSdtError(
        error instanceof Error
          ? error.message
          : "The block SDT could not be added.",
      );
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  }

  async function exportDocument() {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    try {
      await formatting?.flush();
      await editorRef.current
        ?.getInstance()
        ?.export({ exportType: ["docx"], exportedName: "sample-edited" });
    } catch (error) {
      setSdtError(
        error instanceof Error
          ? error.message
          : "The document could not be exported.",
      );
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  return (
    <main className="demo-shell" ref={mainRef}>
      <section className="demo-controls" aria-label="Demo controls">
        <div className="demo-header">
          <div className="demo-title">
            <span className="demo-brand">SuperDoc</span>
            <h1>Formatting demo</h1>
            <p>Choose how edits appear in your document.</p>
          </div>
          <div className="demo-actions">
            <button
              className="demo-button demo-button-primary"
              disabled={
                !ready ||
                exporting ||
                adding ||
                changingScope ||
                formatting?.isInitializing
              }
              onClick={() => void exportDocument()}
              type="button"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <path
                  d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Export DOCX
            </button>
            <button
              className="demo-button demo-button-secondary"
              disabled={
                !ready ||
                exporting ||
                adding ||
                changingScope ||
                formatting?.isInitializing
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void addSdt()}
              type="button"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Add SDT
            </button>
          </div>
        </div>
        <div className="demo-mode-row">
          <div className="demo-mode-picker">
            <span className="demo-field-label">Automatic formatting</span>
            <div
              className="formatting-controls"
              role="group"
              aria-label="Automatic formatting"
            >
              {(
                [
                  ["sdts", "Format SDTs"],
                  ["all", "Format all"],
                  ["delimiters", "Format between delimiters"],
                  ["none", "Format none"],
                ] as const
              ).map(([scope, label]) => (
                <button
                  key={scope}
                  aria-pressed={formattingScope === scope}
                  disabled={
                    !ready ||
                    exporting ||
                    adding ||
                    changingScope ||
                    formatting?.isInitializing
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void selectFormattingScope(scope)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="demo-mode-description">
            {formattingScope === "none" ? (
              <p>Normal editing</p>
            ) : (
              <>
                <div className="demo-format-legend">
                  <span className="legend-addition">Additions</span>
                  <span className="legend-deletion">Deletions</span>
                </div>
                <p>
                  {formattingScope === "sdts"
                    ? "Applies inside SDTs"
                    : formattingScope === "delimiters"
                      ? "Between [[format]] and [[/format]]"
                      : "Applies to all document text"}
                </p>
              </>
            )}
          </div>
        </div>
        {sdtError && (
          <p className="demo-message demo-message-error" role="alert">
            {sdtError}
          </p>
        )}
        {formatting?.error && (
          <p className="demo-message demo-message-error" role="alert">
            {formatting.error.message}
          </p>
        )}
        {sdtStatus && (
          <p className="demo-message demo-message-success" role="status">
            {sdtStatus}
          </p>
        )}
      </section>
      <div
        className="editor-card"
        inert={formatting?.isInitializing}
        aria-busy={formatting?.isInitializing}
      >
        <SuperDocEditor
          document="/sample.docx"
          documentMode="editing"
          onContentError={reportDocumentError}
          onException={reportDocumentError}
          onReady={() => {
            setReady(true);
          }}
          onEditorUpdate={onDocumentUpdate}
          ref={editorRef}
        />
      </div>
    </main>
  );
}

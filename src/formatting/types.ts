import type { RefObject } from "react";
import type { SuperDocRef } from "@superdoc/react";

export type SuperDocInstance = NonNullable<
  ReturnType<SuperDocRef["getInstance"]>
>;
export type DocumentApi = NonNullable<
  NonNullable<SuperDocInstance["activeEditor"]>["doc"]
>;
export type SelectionTarget = NonNullable<
  Awaited<ReturnType<DocumentApi["selection"]["current"]>>["selectionTarget"]
>;
export type InsertedSpan = NonNullable<
  NonNullable<
    Awaited<ReturnType<DocumentApi["insert"]>>["effects"]
  >["insertedText"]
>[number];
export type EditIntent =
  | { type: "insert"; text: string; html?: string }
  | { type: "break"; soft?: boolean }
  | { type: "delete"; backward: boolean; word?: boolean };

export interface EditPolicy {
  combinePlainText?: boolean;
  prepare(
    doc: DocumentApi,
    target: SelectionTarget,
    intent: EditIntent,
  ): Promise<{
    caret: SelectionTarget;
    formatInserted(
      spans: InsertedSpan[],
      intent: Extract<EditIntent, { type: "insert" }>,
    ): Promise<void>;
  }>;
}

export interface ControllerOptions {
  element: HTMLElement;
  getInstance: () => SuperDocInstance | null;
  onError?: (error: unknown) => void;
  onSuccess?: () => void;
}

export interface FormattingController {
  flush(): Promise<void>;
  reconcile(): Promise<void>;
  resetSelection(): void;
  destroy(): void;
}

export interface FormattingHookOptions {
  editorRef: RefObject<SuperDocRef | null>;
  containerRef: RefObject<HTMLElement | null>;
  ready: boolean;
  enabled?: boolean;
  onError?: (error: Error) => void;
  onSuccess?: () => void;
}

export interface FormattingHookResult {
  error: Error | null;
  isInitializing: boolean;
  onEditorUpdate(): void;
  flush(): Promise<void>;
  resetSelection(): void;
}

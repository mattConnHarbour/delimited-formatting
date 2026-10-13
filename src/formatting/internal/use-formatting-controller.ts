import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ControllerOptions,
  FormattingController,
  FormattingHookOptions,
  FormattingHookResult,
} from "../types";

export function useFormattingController(
  create: (options: ControllerOptions) => FormattingController,
  options: FormattingHookOptions,
): FormattingHookResult {
  const { editorRef, containerRef, ready, enabled = true } = options;
  const callbacks = useRef(options);
  callbacks.current = options;
  const controllerRef = useRef<FormattingController | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    setError(null);
    setInitialized(false);
    if (!enabled || !ready || !containerRef.current) return;
    let mounted = true;
    const onError = (cause: unknown) => {
      if (!mounted) return;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      setError(error);
      callbacks.current.onError?.(error);
    };
    let controller: FormattingController;
    try {
      controller = create({
        element: containerRef.current,
        getInstance: () => editorRef.current?.getInstance() ?? null,
        onError,
        onSuccess: () => {
          if (!mounted) return;
          setError(null);
          callbacks.current.onSuccess?.();
        },
      });
    } catch (cause) {
      onError(cause);
      setInitialized(true);
      return;
    }
    controllerRef.current = controller;
    void controller
      .reconcile()
      .catch(() => {})
      .finally(() => {
        if (mounted) setInitialized(true);
      });
    return () => {
      mounted = false;
      controller.destroy();
      controllerRef.current = null;
    };
  }, [create, editorRef, containerRef, enabled, ready]);

  const onEditorUpdate = useCallback(() => {
    void controllerRef.current?.reconcile().catch(() => {});
  }, []);
  const flush = useCallback(async () => {
    await controllerRef.current?.flush();
  }, []);
  const resetSelection = useCallback(
    () => controllerRef.current?.resetSelection(),
    [],
  );
  return {
    error,
    isInitializing: enabled && ready && !initialized,
    onEditorUpdate,
    flush,
    resetSelection,
  };
}

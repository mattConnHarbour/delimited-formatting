import { act, StrictMode, useRef, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import type { SuperDocRef } from "@superdoc/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  useDocumentFormatting,
  useSDTFormatting,
  useDelimitedFormatting,
  createDocumentFormattingController,
  createSDTFormattingController,
  createDelimitedFormattingController,
  type FormattingHookResult,
  type DelimitedFormattingHookOptions,
} from "../src/formatting";
import type {
  SelectionTarget,
  SuperDocInstance,
} from "../src/formatting/types";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function fakeEditor() {
  let text = "";
  let selection: SelectionTarget = {
    kind: "selection",
    start: { kind: "text", blockId: "p1", offset: 0 },
    end: { kind: "text", blockId: "p1", offset: 0 },
  };
  let hold: Promise<void> | undefined;
  const insert = vi.fn(
    async ({ target, value }: { target: SelectionTarget; value: string }) => {
      await hold;
      if (target.end.kind !== "text")
        throw new Error("Expected a text target.");
      const end = { ...target.end, offset: target.end.offset + value.length };
      text =
        text.slice(0, target.end.offset) +
        value +
        text.slice(target.end.offset);
      return {
        success: true,
        effects: {
          insertedText: [{ text: value, selectionTarget: { ...target, end } }],
        },
      };
    },
  );
  const format = vi.fn(async () => ({ success: true }));
  const list = vi.fn(async () => ({ items: [], total: 0 }));
  const current = vi.fn(async () => ({ selectionTarget: selection }));
  const instance = {
    activeEditor: {
      doc: {
        selection: { current },
        get: async () => ({
          body: [
            {
              kind: "paragraph",
              id: "p1",
              paragraph: { inlines: [{ kind: "run", run: { text } }] },
            },
          ],
        }),
        insert,
        format: { apply: format },
        contentControls: { list },
      },
    },
    ui: {
      selection: {
        apply: (target: SelectionTarget) => {
          selection = target;
          return { ok: true };
        },
      },
    },
  } as unknown as SuperDocInstance;
  return {
    instance,
    insert,
    format,
    list,
    current,
    setText(value: string, offset: number) {
      text = value;
      const point = { kind: "text" as const, blockId: "p1", offset };
      selection = { kind: "selection", start: point, end: point };
    },
    hold: (promise: Promise<void>) => {
      hold = promise;
    },
  };
}

async function mountHook(
  hook: typeof useDocumentFormatting,
  initial: Partial<DelimitedFormattingHookOptions> = {},
) {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const editor = fakeEditor();
  const editorRef = {
    current: { getInstance: () => editor.instance },
  } as RefObject<SuperDocRef | null>;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let result!: FormattingHookResult;
  let props = initial;
  function Customer() {
    const containerRef = useRef<HTMLDivElement>(null);
    result = hook({ editorRef, containerRef, ready: true, ...props });
    return (
      <div ref={containerRef}>
        <div className="superdoc-layout" tabIndex={0} />
      </div>
    );
  }
  async function render(next = props) {
    props = next;
    await act(async () => {
      root.render(
        <StrictMode>
          <Customer />
        </StrictMode>,
      );
    });
  }
  await render();
  cleanups.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  return {
    editor,
    render,
    result: () => result,
    type(key: string) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      host.querySelector(".superdoc-layout")!.dispatchEvent(event);
      return event.defaultPrevented;
    },
  };
}

test("customer hook waits for readiness, handles StrictMode, and detaches when disabled", async () => {
  const customer = await mountHook(useDocumentFormatting, { ready: false });
  expect(customer.type("a")).toBe(false);
  expect(customer.editor.insert).not.toHaveBeenCalled();
  await customer.render({ ready: true });
  await act(async () => {
    expect(customer.type("a")).toBe(true);
    await customer.result().flush();
  });
  expect(customer.editor.insert).toHaveBeenCalledOnce();
  expect(customer.editor.format).toHaveBeenCalledWith(
    expect.objectContaining({ inline: { underline: true, strike: false } }),
  );
  await customer.render({ enabled: false });
  expect(customer.type("b")).toBe(false);
  await customer.render({ enabled: true });
  await act(async () => {
    customer.type("c");
    await customer.result().flush();
  });
  expect(customer.editor.insert).toHaveBeenCalledTimes(2);
});

test("flush waits for queued insertion and formatting before saving", async () => {
  const customer = await mountHook(useDocumentFormatting);
  const barrier = deferred();
  customer.editor.hold(barrier.promise);
  let saved = false;
  await act(async () => {
    customer.type("a");
    customer.type("b");
    const flush = customer
      .result()
      .flush()
      .then(() => {
        saved = true;
      });
    await Promise.resolve();
    expect(saved).toBe(false);
    expect(customer.editor.format).not.toHaveBeenCalled();
    barrier.resolve();
    await flush;
  });
  expect(saved).toBe(true);
  expect(customer.editor.insert).toHaveBeenCalledTimes(2);
  expect(customer.editor.format).toHaveBeenCalledTimes(2);
});

test("hook exposes initialization until the initial SDT pass has finished", async () => {
  const customer = await mountHook(useSDTFormatting, { ready: false });
  const barrier = deferred();
  customer.editor.list.mockImplementationOnce(async () => {
    await barrier.promise;
    return { items: [], total: 0 };
  });
  await customer.render({ ready: true });
  expect(customer.result().isInitializing).toBe(true);
  await act(async () => {
    barrier.resolve();
    await customer.result().flush();
  });
  expect(customer.result().isInitializing).toBe(false);
});

test("hook reports editing failures to the latest callback and exposes the error", async () => {
  const oldError = vi.fn();
  const nextError = vi.fn();
  const customer = await mountHook(useDocumentFormatting, {
    onError: oldError,
  });
  await customer.render({ onError: nextError });
  const failure = new Error("Insertion rejected");
  customer.editor.insert.mockRejectedValueOnce(failure);
  await act(async () => {
    customer.type("a");
    await expect(customer.result().flush()).rejects.toThrow(
      "Insertion rejected",
    );
  });
  expect(oldError).not.toHaveBeenCalled();
  expect(nextError).toHaveBeenCalledWith(failure);
  expect(customer.result().error).toBe(failure);
  await act(async () => {
    customer.type("b");
    await customer.result().flush();
  });
  expect(customer.result().error).toBeNull();
});

test("SDT hook reconciles document updates; delimiter hook skips global underline enforcement", async () => {
  const sdts = await mountHook(useSDTFormatting);
  sdts.editor.list.mockClear();
  await act(async () => {
    sdts.result().onEditorUpdate();
    await sdts.result().flush();
  });
  expect(sdts.editor.list).toHaveBeenCalled();
  const delimiters = await mountHook(useDelimitedFormatting);
  await act(async () => {
    delimiters.result().onEditorUpdate();
    await delimiters.result().flush();
  });
  expect(delimiters.editor.list).not.toHaveBeenCalled();
});

test("controllers prevent duplicate interception and release ownership on destroy", () => {
  const element = document.createElement("div");
  const editor = fakeEditor();
  const options = { element, getInstance: () => editor.instance };
  const controller = createDocumentFormattingController(options);
  expect(() => createSDTFormattingController(options)).toThrow(
    "only one formatting controller",
  );
  controller.destroy();
  controller.destroy();
  const replacement = createSDTFormattingController(options);
  replacement.destroy();
});

test("the delimiter controller formats custom regions and ignores default markers", async () => {
  const element = document.createElement("div");
  const surface = document.createElement("div");
  surface.className = "superdoc-layout";
  element.append(surface);
  const editor = fakeEditor();
  const controller = createDelimitedFormattingController({
    element,
    getInstance: () => editor.instance,
    delimiters: { open: "<<", close: ">>" },
  });
  try {
    editor.setText("<<inside>>", 2);
    surface.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "a",
        bubbles: true,
        cancelable: true,
      }),
    );
    await controller.flush();
    expect(editor.format).toHaveBeenLastCalledWith(
      expect.objectContaining({ inline: { underline: true, strike: false } }),
    );
    controller.resetSelection();
    editor.setText("[[format]]inside[[/format]]", 10);
    surface.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "b",
        bubbles: true,
        cancelable: true,
      }),
    );
    await controller.flush();
    expect(editor.format).toHaveBeenLastCalledWith(
      expect.objectContaining({ inline: { underline: false, strike: false } }),
    );
  } finally {
    controller.destroy();
  }
});

test("the delimiter hook preserves its controller for equivalent options and updates when delimiters change", async () => {
  const customer = await mountHook(useDelimitedFormatting, {
    delimiters: { open: "<<", close: ">>" },
  });
  customer.editor.setText("<<inside>>", 2);
  await act(async () => {
    customer.type("a");
    await customer.result().flush();
  });
  expect(customer.editor.format).toHaveBeenLastCalledWith(
    expect.objectContaining({ inline: { underline: true, strike: false } }),
  );
  await customer.render({ delimiters: { open: "<<", close: ">>" } });
  await act(async () => {
    customer.type("b");
    await customer.result().flush();
  });
  expect(customer.editor.current).toHaveBeenCalledOnce();
  await customer.render({ delimiters: { open: "{{", close: "}}" } });
  customer.editor.setText("<<old>> {{new}}", 10);
  await act(async () => {
    customer.type("c");
    await customer.result().flush();
  });
  expect(customer.editor.current).toHaveBeenCalledTimes(2);
  expect(customer.editor.format).toHaveBeenLastCalledWith(
    expect.objectContaining({ inline: { underline: true, strike: false } }),
  );
  customer.result().resetSelection();
  customer.editor.setText("<<old>> {{new}}", 2);
  await act(async () => {
    customer.type("d");
    await customer.result().flush();
  });
  expect(customer.editor.format).toHaveBeenLastCalledWith(
    expect.objectContaining({ inline: { underline: false, strike: false } }),
  );
});

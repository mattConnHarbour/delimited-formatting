import type { SuperDocInstance } from "../types";

export function hasTextWithoutUnderline(html: string): boolean {
  const root = new DOMParser().parseFromString(html, "text/html").body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    let underlined = false;
    for (
      let element = node.parentElement;
      element;
      element = element.parentElement
    ) {
      const decoration = `${element.style.textDecoration} ${element.style.textDecorationLine}`;
      if (element.tagName === "U" || decoration.includes("underline")) {
        underlined = true;
        break;
      }
    }
    if (!underlined) return true;
  }
  return false;
}

export async function enforceSdtUnderline(
  instance: SuperDocInstance,
): Promise<void> {
  const doc = instance.activeEditor?.doc;
  if (!doc) return;
  let offset = 0;
  while (true) {
    const controls = await doc.contentControls.list({ offset, limit: 100 });
    for (const control of controls.items) {
      if (!control.text?.trim()) continue;
      if (!control.selectionTarget)
        throw new Error(
          "An SDT has no text range available for mandatory underline.",
        );
      const html = await doc.getHtml({ scope: control.selectionTarget });
      if (!hasTextWithoutUnderline(html)) continue;
      const receipt = await doc.format.underline({
        target: control.selectionTarget,
        value: true,
      });
      if (!receipt.success && receipt.failure.code !== "NO_OP")
        throw new Error(receipt.failure.message);
    }
    offset += controls.items.length;
    if (offset >= controls.total || controls.items.length === 0) return;
  }
}

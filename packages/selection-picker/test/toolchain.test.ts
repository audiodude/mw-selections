import { LitElement, css, html } from "lit";
import { expect, test } from "vitest";
import { Sitematrix } from "@audiodude/selection-core";
import { pickerErr, pickerOk } from "../src/result.js";

class ToolchainProbe extends LitElement {
  static override styles = css`
    :host { display: block; }
  `;
  static override properties = { label: { type: String } };
  declare label: string;
  constructor() {
    super();
    this.label = "";
  }
  override render() {
    return html`<dialog><p>${this.label}</p></dialog>`;
  }
  get dialogEl(): HTMLDialogElement {
    return this.renderRoot.querySelector("dialog")!;
  }
}
if (!customElements.get("toolchain-probe")) {
  customElements.define("toolchain-probe", ToolchainProbe);
}

/** Each test mounts its own probe: no test depends on another's DOM. */
async function mountProbe(label = ""): Promise<ToolchainProbe> {
  document.body.innerHTML = `<toolchain-probe label="${label}"></toolchain-probe>`;
  const el = document.querySelector("toolchain-probe") as ToolchainProbe;
  await el.updateComplete;
  return el;
}

test("decorator-free Lit renders into shadow DOM with constructable styles", async () => {
  const el = await mountProbe("ok");
  expect(el.renderRoot.querySelector("p")!.textContent).toBe("ok");
  // CSP: constructable stylesheets, not injected <style> tags.
  expect((el.shadowRoot as ShadowRoot).adoptedStyleSheets.length).toBe(1);
  expect(el.shadowRoot!.querySelectorAll("style").length).toBe(0);
});

test("native dialog showModal/close is available in the test environment", async () => {
  const el = await mountProbe();
  el.dialogEl.showModal();
  expect(el.dialogEl.open).toBe(true);
  el.dialogEl.close();
  expect(el.dialogEl.open).toBe(false);
});

test("dialog.close() dispatches the close event the cancel contract rests on", async () => {
  const el = await mountProbe();
  let closes = 0;
  el.dialogEl.addEventListener("close", () => {
    closes += 1;
  });
  el.dialogEl.showModal();
  el.dialogEl.close();
  expect(closes).toBe(1);
});

test("file upload plumbing exists: DataTransfer, input.files, File.arrayBuffer", async () => {
  const transfer = new DataTransfer();
  transfer.items.add(new File([new TextEncoder().encode("Paris\t1\n")], "list.tsv"));
  document.body.innerHTML = `<input type="file" />`;
  const input = document.querySelector("input") as HTMLInputElement;
  input.files = transfer.files;
  expect(input.files!.length).toBe(1);
  const bytes = new Uint8Array(await input.files![0]!.arrayBuffer());
  expect(new TextDecoder().decode(bytes)).toBe("Paris\t1\n");
});

test("core is importable by package name and results widen to PickerResult", () => {
  expect(Sitematrix.fromJson({ nope: true }).ok).toBe(false);
  expect(pickerOk(1)).toEqual({ ok: true, value: 1 });
  expect(pickerErr("DBNAME_NOT_ALLOWED", "x").error.code).toBe("DBNAME_NOT_ALLOWED");
});

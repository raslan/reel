import { afterEach, describe, expect, it, vi } from "vitest";
import { flush, type Mounted, mountApp, until } from "../test/render";
import { FolderTitle } from "./FolderTitle";

let mounted: Mounted;

const q = <T extends Element>(sel: string) => mounted.container.querySelector<T>(sel);

const setInput = (input: HTMLInputElement, value: string) =>
  flush(() => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

afterEach(() => {
  mounted.unmount();
});

describe("FolderTitle", () => {
  const props = {
    path: "Podcasts/Comedy",
    label: "Standup",
    realName: "Comedy",
    busy: false,
    onRename: vi.fn(async () => {}),
    onReset: vi.fn(async () => {}),
  };

  it("shows the alias and the real folder path, and commits a typed name", async () => {
    const onRename = vi.fn(async () => {});
    mounted = await mountApp(<FolderTitle {...props} onRename={onRename} />);
    expect(mounted.container.textContent).toContain("Standup");
    expect(mounted.container.textContent).toContain("Real folder: Podcasts/Comedy");

    await flush(() => q<HTMLButtonElement>('button[aria-label="Rename folder"]')?.click());
    const input = q<HTMLInputElement>('input[aria-label="Folder display name"]');
    if (input === null) throw new Error("rename input missing");
    await setInput(input, "Live");
    await flush(() => input.form?.requestSubmit());

    expect(onRename).toHaveBeenCalledWith("Live");
    await until(() => q('input[aria-label="Folder display name"]') === null);
    expect(mounted.container.textContent).toContain("Standup"); // parent has not re-rendered a new label yet
  });

  it("Esc cancels without saving", async () => {
    const onRename = vi.fn(async () => {});
    mounted = await mountApp(<FolderTitle {...props} onRename={onRename} />);
    await flush(() => q<HTMLButtonElement>('button[aria-label="Rename folder"]')?.click());
    const input = q<HTMLInputElement>('input[aria-label="Folder display name"]');
    if (input === null) throw new Error("rename input missing");
    await setInput(input, "Nope");
    await flush(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onRename).not.toHaveBeenCalled();
    expect(q('input[aria-label="Folder display name"]')).toBeNull();
  });

  it("keeps the input open when saving fails, and offers a reset when aliased", async () => {
    const onRename = vi.fn(async () => {
      throw new Error("nope");
    });
    const onReset = vi.fn(async () => {});
    mounted = await mountApp(<FolderTitle {...props} onRename={onRename} onReset={onReset} />);
    await flush(() => q<HTMLButtonElement>('button[aria-label="Rename folder"]')?.click());
    const input = q<HTMLInputElement>('input[aria-label="Folder display name"]');
    if (input === null) throw new Error("rename input missing");
    await setInput(input, "Live");
    await flush(() => input.form?.requestSubmit());

    await until(() => q('button[aria-label="Use real folder name"]') !== null);
    expect(q('input[aria-label="Folder display name"]')).not.toBeNull();

    await flush(() => q<HTMLButtonElement>('button[aria-label="Use real folder name"]')?.click());
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("is not renameable at the library root", async () => {
    mounted = await mountApp(<FolderTitle {...props} path="" label="Library" realName="Library" />);
    expect(mounted.container.textContent).toContain("Library");
    expect(q('button[aria-label="Rename folder"]')).toBeNull();
  });
});

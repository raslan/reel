import { afterEach, describe, expect, it, vi } from "vitest";
import { type Mounted, mountApp } from "../test/render";
import { FolderRow } from "./FolderRow";

let mounted: Mounted;

afterEach(() => {
  mounted.unmount();
});

describe("FolderRow", () => {
  it("shows the supplied label and exposes the real path on hover", async () => {
    mounted = await mountApp(
      <FolderRow
        folder={{ name: "Comedy", path: "Podcasts/Comedy" }}
        label="Standup"
        onOpen={vi.fn()}
      />,
    );
    expect(mounted.container.textContent).toContain("Standup");
    expect(mounted.container.textContent).not.toContain("Comedy");
    expect(mounted.container.querySelector('[title="Podcasts/Comedy"]')).not.toBeNull();
  });

  it("opens the real path", async () => {
    const onOpen = vi.fn();
    mounted = await mountApp(
      <FolderRow
        folder={{ name: "Comedy", path: "Podcasts/Comedy" }}
        label="Standup"
        onOpen={onOpen}
      />,
    );
    mounted.container.querySelector("button")?.click();
    expect(onOpen).toHaveBeenCalledWith("Podcasts/Comedy");
  });
});

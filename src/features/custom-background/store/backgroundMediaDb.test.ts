import { beforeEach, describe, expect, it } from "vitest";
import {
  saveBackgroundMedia,
  loadBackgroundMedia,
  deleteBackgroundMedia,
  dataUrlToBlob,
} from "./backgroundMediaDb";

describe("backgroundMediaDb", () => {
  beforeEach(async () => {
    await deleteBackgroundMedia();
  });

  it("saves, loads and deletes the wallpaper file", async () => {
    const blob = new Blob(["gif bytes"], { type: "image/gif" });
    const saved = await saveBackgroundMedia(blob, "cat.gif");
    expect(saved).toMatchObject({
      type: "image/gif",
      name: "cat.gif",
      size: blob.size,
    });

    const loaded = await loadBackgroundMedia();
    expect(loaded?.name).toBe("cat.gif");
    expect(loaded?.blob.size).toBe(blob.size);

    await deleteBackgroundMedia();
    expect(await loadBackgroundMedia()).toBeNull();
  });

  it("keeps only the latest file", async () => {
    await saveBackgroundMedia(new Blob(["a"], { type: "image/png" }), "a.png");
    await saveBackgroundMedia(new Blob(["bb"], { type: "video/mp4" }), "b.mp4");
    expect((await loadBackgroundMedia())?.name).toBe("b.mp4");
  });

  it("turns a legacy data url back into a blob", async () => {
    const blob = dataUrlToBlob("data:image/png;base64,aGVsbG8=");
    expect(blob?.type).toBe("image/png");
    expect(await blob?.text()).toBe("hello");
    expect(dataUrlToBlob("not a data url")).toBeNull();
  });
});

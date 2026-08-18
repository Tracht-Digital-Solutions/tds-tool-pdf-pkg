import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import pack from "./index";

/**
 * Manifest contract tests.
 *
 * Every tool in this pack is **premium**, so the monetisation fields are the
 * point: `premiumDefault` decides whether the site's `ToolGate` demands a login
 * plus an entitlement, and `priceCentsDefault` seeds the Stripe Checkout amount.
 * A flag lost in an edit silently turns a paid tool into a free one — nothing
 * anywhere goes red, the tool simply stops asking for money.
 *
 * The copy budgets are asserted here as well as in the site, because failing in
 * the pack that owns the string is the difference between a two-line fix and a
 * red build in a repo whose author did not write the sentence.
 */

const repoRoot = new URL("..", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", repoRoot), "utf8")) as {
  name: string;
  files: string[];
};

/** Categories the tools site renders a section for. */
const CATEGORIES = ["business", "content", "developer", "design", "marketing", "media", "security"];

const IDS = ["bilder-zu-pdf", "pdf-komprimieren", "pdf-wasserzeichen", "pdf-zu-bildern"];

describe("pack envelope", () => {
  it("declares a stable pack id and name", () => {
    expect(pack.id).toBe("pdf");
    expect(pack.name).toBe("PDF");
  });

  it("ships all four documented tools", () => {
    expect(pack.tools.map((t) => t.id).sort()).toEqual(IDS);
  });
});

describe("tool ids and slugs", () => {
  it("has no duplicate id or slug within the pack", () => {
    const ids = pack.tools.map((t) => t.id);
    const slugs = pack.tools.map((t) => t.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses URL-safe slugs (they become /tools/<slug>)", () => {
    for (const t of pack.tools) {
      expect(t.slug, `slug of ${t.id}`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(encodeURIComponent(t.slug)).toBe(t.slug);
    }
  });

  it("never collides with the PDF tool that stays in tds-tool-media", () => {
    // `pdf-tools` / `pdf-werkzeuge` lives in the media pack and does NOT move
    // here. `composeToolPacks` hard-errors on a collision, which would take the
    // whole tools site build down rather than just this pack.
    expect(pack.tools.map((t) => t.id)).not.toContain("pdf-tools");
    expect(pack.tools.map((t) => t.slug)).not.toContain("pdf-werkzeuge");
  });
});

describe("premium gating", () => {
  it("marks every tool premium with a price", () => {
    for (const t of pack.tools) {
      expect(t.premiumDefault, `${t.id} must be premium`).toBe(true);
      expect(t.priceCentsDefault, `${t.id} is premium but unpriced`).toBeGreaterThan(0);
    }
  });

  it("states every price in whole cents", () => {
    for (const t of pack.tools) {
      const price = t.priceCentsDefault;
      if (price === undefined) continue;
      expect(Number.isInteger(price), `${t.id} price must be an integer`).toBe(true);
    }
  });

  it("never prices a tool that is not premium", () => {
    for (const t of pack.tools) {
      if (!t.premiumDefault) {
        expect(t.priceCentsDefault, `${t.id} is free but priced`).toBeUndefined();
      }
    }
  });

  it("does not require a login on top of the purchase", () => {
    // Premium already implies a login; setting both would be redundant state
    // that the admin catalog then has to keep consistent.
    for (const t of pack.tools) {
      expect(t.requiresLoginDefault ?? false, `${t.id}`).toBe(false);
    }
  });
});

describe("required tool fields", () => {
  it.each(IDS.map((id) => [id]))("%s is fully described", (id) => {
    const tool = pack.tools.find((t) => t.id === id);
    if (!tool) throw new Error(`tool ${id} is missing from the pack`);

    expect(tool.name.length).toBeGreaterThan(3);
    expect(tool.icon).toBeTruthy();
    expect(CATEGORIES).toContain(tool.category);

    const { keywords } = tool;
    if (!keywords) throw new Error(`tool ${id} has no keywords`);
    expect(keywords.length).toBeGreaterThan(2);
  });

  it("keeps every rendered description inside the search-result budget", () => {
    // The site renders `seo.description ?? description`; both are asserted so a
    // later removal of the seo block cannot push the fallback out of budget.
    for (const t of pack.tools) {
      for (const [label, text] of [
        ["description", t.description],
        ["seo.description", t.seo?.description],
      ] as const) {
        if (!text) throw new Error(`tool ${t.id} has no ${label}`);
        expect([...text].length, `${label} of ${t.id}`).toBeGreaterThan(80);
        expect([...text].length, `${label} of ${t.id}`).toBeLessThanOrEqual(160);
      }
    }
  });

  it("keeps every SEO title inside the rendered budget and off the brand", () => {
    for (const t of pack.tools) {
      const title = t.seo?.title;
      if (!title) throw new Error(`tool ${t.id} has no seo.title`);
      expect([...title].length, `seo.title of ${t.id}`).toBeLessThanOrEqual(60);
      // A site that ranks on tool queries must not spend the rendered budget on
      // a word nobody searched for.
      expect(title.startsWith("TD Tools"), `seo.title of ${t.id}`).toBe(false);
    }
  });

  it("says something different about each tool", () => {
    const descriptions = pack.tools.map((t) => t.seo?.description ?? t.description);
    const titles = pack.tools.map((t) => t.seo?.title);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("component wiring", () => {
  it("points every component at this package's own tools/ directory", () => {
    for (const t of pack.tools) {
      expect(t.component.startsWith(`${pkg.name}/tools/`), `${t.id} component`).toBe(true);
      expect(t.component.endsWith(".astro")).toBe(true);
    }
  });

  it("resolves every component to a file that actually exists", () => {
    for (const t of pack.tools) {
      const rel = t.component.slice(`${pkg.name}/`.length);
      expect(existsSync(fileURLToPath(new URL(rel, repoRoot))), `missing ${rel}`).toBe(true);
    }
  });

  it("publishes the directories the site consumes as source", () => {
    expect(pkg.files).toContain("tools");
    expect(pkg.files).toContain("islands");
  });
});

describe("i18n", () => {
  it("provides the same keys in German and English", () => {
    const de = Object.keys(pack.i18n?.de ?? {}).sort();
    const en = Object.keys(pack.i18n?.en ?? {}).sort();
    expect(de).toEqual(en);
    expect(de.length).toBeGreaterThan(0);
  });

  it("namespaces every i18n key under the pack id", () => {
    for (const key of Object.keys(pack.i18n?.de ?? {})) {
      expect(key.startsWith(`${pack.id}.`), `key "${key}"`).toBe(true);
    }
  });
});

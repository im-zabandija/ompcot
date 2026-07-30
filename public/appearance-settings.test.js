import { beforeEach, describe, expect, it } from "vitest";
import {
  applyAccentOverride,
  applyDensity,
  applyFontSize,
  applyMotion,
  applySidebarWidth,
  applyTypingFx,
  clearAccentOverride,
  clearDensity,
  clearFontSize,
  clearMotion,
  clearSidebarWidth,
  clearTypingFx,
  getAccentOverride,
  getDensity,
  getFontSize,
  getMotion,
  getSidebarWidth,
  getTypingFx,
  getVoiceLocale,
  hasTypingFx,
  setVoiceLocale,
} from "./themes.js";

const APPEARANCE_COOKIES = [
  "ompcot-accent",
  "ompcot-font-size",
  "ompcot-density",
  "ompcot-sidebar-width",
  "ompcot-motion",
  "ompcot-voice-locale",
  "ompcot-typing-fx",
];

function resetDocument() {
  // Cookies persist across tests in jsdom — expire each appearance cookie.
  for (const name of APPEARANCE_COOKIES) {
    // biome-ignore lint/suspicious/noDocumentCookie: test cleanup — sync expiry between cases
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
  const root = document.documentElement;
  for (const prop of [
    "--accent",
    "--accent-glow",
    "--accent-subtle",
    "--accent-text",
    "--font-size-base",
    "--sidebar-width",
  ]) {
    root.style.removeProperty(prop);
  }
  root.removeAttribute("data-density");
  root.removeAttribute("data-motion");
  root.removeAttribute("data-typing-fx");
}

beforeEach(resetDocument);

describe("accent override", () => {
  it("persists a valid hex to the ompcot-accent cookie and inline styles", () => {
    expect(applyAccentOverride("#ff8800")).toBe(true);
    expect(getAccentOverride()).toBe("#ff8800");
    expect(document.cookie).toContain("ompcot-accent=%23ff8800");
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--accent")).toBe("#ff8800");
    expect(style.getPropertyValue("--accent-glow")).toBe("rgba(255, 136, 0, 0.15)");
    expect(style.getPropertyValue("--accent-subtle")).toBe("rgba(255, 136, 0, 0.08)");
    expect(style.getPropertyValue("--accent-text")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("rejects invalid hex values and leaves state untouched", () => {
    expect(applyAccentOverride("#ABC")).toBe(false);
    expect(applyAccentOverride("ff8800")).toBe(false);
    expect(applyAccentOverride("#gggggg")).toBe(false);
    expect(applyAccentOverride("")).toBe(false);
    expect(applyAccentOverride(null)).toBe(false);
    expect(getAccentOverride()).toBe(null);
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("");
  });

  it("ignores a cookie that no longer matches the hex format", () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test fixture — seed a malformed cookie
    document.cookie = "ompcot-accent=not-a-hex; Path=/";
    expect(getAccentOverride()).toBe(null);
  });

  it("clearAccentOverride removes inline styles and the cookie", () => {
    applyAccentOverride("#123456");
    clearAccentOverride();
    expect(getAccentOverride()).toBe(null);
    const style = document.documentElement.style;
    for (const prop of ["--accent", "--accent-glow", "--accent-subtle", "--accent-text"]) {
      expect(style.getPropertyValue(prop)).toBe("");
    }
  });
});

describe("font size", () => {
  it("maps small/medium/large to concrete px on --font-size-base and persists the label", () => {
    expect(applyFontSize("small")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--font-size-base")).toBe("14px");
    expect(getFontSize()).toBe("small");

    expect(applyFontSize("medium")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--font-size-base")).toBe("15px");
    expect(getFontSize()).toBe("medium");

    expect(applyFontSize("large")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--font-size-base")).toBe("16px");
    expect(getFontSize()).toBe("large");
    expect(document.cookie).toContain("ompcot-font-size=large");
  });

  it("rejects unknown labels", () => {
    expect(applyFontSize("huge")).toBe(false);
    expect(applyFontSize("")).toBe(false);
    expect(getFontSize()).toBe(null);
  });

  it("clearFontSize wipes both the inline var and the cookie", () => {
    applyFontSize("large");
    clearFontSize();
    expect(document.documentElement.style.getPropertyValue("--font-size-base")).toBe("");
    expect(getFontSize()).toBe(null);
  });
});

describe("density", () => {
  it("writes data-density and the cookie for comfortable/compact", () => {
    expect(applyDensity("compact")).toBe(true);
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    expect(getDensity()).toBe("compact");
    expect(document.cookie).toContain("ompcot-density=compact");

    expect(applyDensity("comfortable")).toBe(true);
    expect(getDensity()).toBe("comfortable");
  });

  it("rejects unknown densities", () => {
    expect(applyDensity("tight")).toBe(false);
    expect(applyDensity("")).toBe(false);
    expect(getDensity()).toBe(null);
  });

  it("clearDensity removes the attribute and cookie", () => {
    applyDensity("compact");
    clearDensity();
    expect(document.documentElement.hasAttribute("data-density")).toBe(false);
    expect(getDensity()).toBe(null);
  });
});

describe("sidebar width", () => {
  it("accepts values in the 220-360px range and persists them rounded", () => {
    expect(applySidebarWidth(220)).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--sidebar-width")).toBe("220px");
    expect(getSidebarWidth()).toBe(220);

    expect(applySidebarWidth(360)).toBe(true);
    expect(getSidebarWidth()).toBe(360);

    expect(applySidebarWidth(287.6)).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--sidebar-width")).toBe("288px");
    expect(getSidebarWidth()).toBe(288);
    expect(document.cookie).toContain("ompcot-sidebar-width=288");
  });

  it("rejects values outside the range or non-numeric inputs", () => {
    expect(applySidebarWidth(219)).toBe(false);
    expect(applySidebarWidth(361)).toBe(false);
    expect(applySidebarWidth("wide")).toBe(false);
    expect(applySidebarWidth(Number.NaN)).toBe(false);
    expect(getSidebarWidth()).toBe(null);
  });

  it("ignores a cookie value outside the range", () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test fixture — seed an out-of-range cookie
    document.cookie = "ompcot-sidebar-width=1000; Path=/";
    expect(getSidebarWidth()).toBe(null);
  });

  it("clearSidebarWidth removes the override", () => {
    applySidebarWidth(300);
    clearSidebarWidth();
    expect(document.documentElement.style.getPropertyValue("--sidebar-width")).toBe("");
    expect(getSidebarWidth()).toBe(null);
  });
});

describe("motion override", () => {
  it("forces reduced/full via data-motion and persists the mode", () => {
    expect(applyMotion("reduced")).toBe(true);
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduced");
    expect(getMotion()).toBe("reduced");
    expect(applyMotion("full")).toBe(true);
    expect(document.documentElement.getAttribute("data-motion")).toBe("full");
  });

  it("auto removes the attribute so the media query decides", () => {
    applyMotion("reduced");
    expect(applyMotion("auto")).toBe(true);
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    expect(getMotion()).toBe("auto");
  });

  it("rejects invalid modes and clearMotion resets", () => {
    expect(applyMotion("bogus")).toBe(false);
    applyMotion("reduced");
    clearMotion();
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    expect(getMotion()).toBe(null);
  });
});

describe("typing effects", () => {
  it("defaults to all three tokens when no cookie is set", () => {
    expect(getTypingFx()).toEqual(["caret", "tail", "trail"]);
    expect(hasTypingFx("caret")).toBe(true);
    expect(hasTypingFx("tail")).toBe(true);
    expect(hasTypingFx("trail")).toBe(true);
  });

  it("applyTypingFx([]) persists the 'none' sentinel, not an empty cookie", () => {
    // Regression: writeCookie("") deletes the cookie, which would fall back to the
    // "all three" default on next read — the sentinel is what makes "all off" durable.
    applyTypingFx([]);
    expect(document.cookie).toContain("ompcot-typing-fx=none");
    expect(getTypingFx()).toEqual([]);
    expect(hasTypingFx("caret")).toBe(false);
  });

  it("applyTypingFx canonicalizes token order regardless of input order", () => {
    applyTypingFx(["trail", "caret"]);
    expect(document.documentElement.getAttribute("data-typing-fx")).toBe("caret trail");
    expect(getTypingFx()).toEqual(["caret", "trail"]);
    expect(hasTypingFx("tail")).toBe(false);
  });

  it("falls back to the default when the cookie holds no valid tokens", () => {
    // biome-ignore lint/suspicious/noDocumentCookie: simulate a corrupted cookie directly
    document.cookie = "ompcot-typing-fx=bogus; Path=/";
    expect(getTypingFx()).toEqual(["caret", "tail", "trail"]);
  });

  it("clearTypingFx resets the attribute to all three and clears the cookie", () => {
    applyTypingFx([]);
    clearTypingFx();
    expect(document.documentElement.getAttribute("data-typing-fx")).toBe("caret tail trail");
    expect(getTypingFx()).toEqual(["caret", "tail", "trail"]);
  });
});

describe("voice locale", () => {
  it("persists an override and clears back to OS default (null)", () => {
    setVoiceLocale("es-ES");
    expect(getVoiceLocale()).toBe("es-ES");
    setVoiceLocale("");
    expect(getVoiceLocale()).toBe(null);
  });
});

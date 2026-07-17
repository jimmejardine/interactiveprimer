import test from "node:test";
import assert from "node:assert/strict";
import { pickInitialLocale, localeFromSearch, bcp47, lookup, fillVars, LOCALES, DEFAULT_LOCALE } from "../src/i18n.ts";

test("localeFromSearch reads a supported ?lang param (case-insensitive)", () => {
  assert.equal(localeFromSearch("?lang=es"), "es");
  assert.equal(localeFromSearch("?lang=en"), "en");
  assert.equal(localeFromSearch("?lang=ES"), "es");
  assert.equal(localeFromSearch("?foo=1&lang=es"), "es");
});

test("localeFromSearch returns null when absent or unsupported", () => {
  assert.equal(localeFromSearch("?lang=fr"), null);
  assert.equal(localeFromSearch("?lang="), null);
  assert.equal(localeFromSearch("?foo=1"), null);
  assert.equal(localeFromSearch(""), null);
});

test("pickInitialLocale honours a valid stored choice over browser languages", () => {
  assert.equal(pickInitialLocale("es", ["en", "en-GB"]), "es");
  assert.equal(pickInitialLocale("en", ["es"]), "en");
});

test("pickInitialLocale falls back to the first matching browser language", () => {
  assert.equal(pickInitialLocale(null, ["es-MX", "en"]), "es");
  assert.equal(pickInitialLocale(undefined, ["pt", "es"]), "es");
});

test("pickInitialLocale defaults to English when nothing matches", () => {
  assert.equal(pickInitialLocale(null, ["fr", "de"]), DEFAULT_LOCALE);
  assert.equal(pickInitialLocale("nonsense", ["fr"]), "en");
  assert.equal(pickInitialLocale(null, []), "en");
  assert.equal(pickInitialLocale(null), "en");
});

test("bcp47 maps locales to speech-synthesis tags", () => {
  assert.equal(bcp47("en"), "en-US");
  assert.equal(bcp47("es"), "es-ES");
});

test("lookup returns the active-locale string and interpolates vars", () => {
  assert.equal(lookup("en", "quiz.check"), "Check answers");
  assert.equal(lookup("es", "quiz.check"), "Comprobar respuestas");
  assert.equal(lookup("en", "quiz.score", { score: 3, total: 5 }), "You scored 3 / 5.");
  assert.equal(lookup("es", "quiz.score", { score: 3, total: 5 }), "Obtuviste 3 / 5.");
});

test("lookup falls back to the key itself when missing everywhere", () => {
  assert.equal(lookup("es", "totally.unknown.key"), "totally.unknown.key");
});

test("fillVars interpolates {placeholders} and leaves unknown ones intact", () => {
  assert.equal(fillVars("Level {level}", { level: 2.5 }), "Level 2.5");
  assert.equal(fillVars("{a} + {b} = {sum}", { a: 3, b: 4, sum: 7 }), "3 + 4 = 7");
  assert.equal(fillVars("hi {name}", {}), "hi {name}");
});

test("LOCALES includes English (default) and Spanish", () => {
  const ids = LOCALES.map((l) => l.id);
  assert.ok(ids.includes("en"));
  assert.ok(ids.includes("es"));
  assert.equal(DEFAULT_LOCALE, "en");
});

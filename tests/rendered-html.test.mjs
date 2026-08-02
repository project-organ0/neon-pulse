import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the rhythm game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Neon Pulse Protocol/i);
  assert.match(html, /RHYTHM RESTORATION SYSTEM/);
  assert.match(html, /Choose your signal/);
});

test("ships three playable tracks and the core feedback systems", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);

  for (const slug of ["circuit-bloom", "neon-pulse-protocol", "overclock-horizon"]) {
    assert.match(page, new RegExp(`/audio/${slug}\\.ogg`));
    await access(new URL(`public/audio/${slug}.ogg`, root));
  }

  assert.match(page, /type Timing = "EARLY" \| "LATE" \| "JUST"/);
  assert.match(page, /playHitSound/);
  assert.match(page, /REDUCED FX/);
  assert.match(page, /FULL COMBO/);
  assert.match(page, /CORE INTEGRITY/);
  assert.match(page, /GAME OVER/);
  assert.match(page, /EASY: \{ miss: 5, empty: 2 \}/);
  assert.match(page, /sync: Math\.max\(0, current\.sync - 5\)/);
  assert.match(page, /integrity: Math\.max\(0, current\.integrity - damage\)/);
  assert.match(page, /role="progressbar"/);
  assert.match(layout, /<html lang="ko">/);
});

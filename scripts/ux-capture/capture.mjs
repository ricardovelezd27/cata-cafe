#!/usr/bin/env node
/**
 * capture.mjs — READ-ONLY screen capture + measurement of the running app.
 * Read README.md first. In short:
 *
 *   node scripts/ux-capture/capture.mjs --plan owner=master@cata.test,visitor --out scripts/ux-capture/out/before
 *
 * Safety (rules in lib/guard.mjs, pinned by tests/uxCaptureGuard.test.ts):
 *   - runs only against localhost, 127.0.0.1 or [::1] (exits with a message otherwise);
 *   - aborts every request that is not GET / HEAD / OPTIONS, inside the browser, so no server
 *     action, form post or database write can leave the page (the local environment uses the
 *     PRODUCTION database);
 *   - signs in only through the dev-only GET route /api/dev/sign-in, only for the three seeded
 *     test addresses; it never types into the sign-in form.
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GuardError, assertLocalBase, assertTestAddress, buildTargetUrl, isReadOnlyMethod, signInUrl } from "./lib/guard.mjs";
import { hiddenScrollHeight, measure, redactPage } from "./lib/measure.mjs";
import { captureName, orderScreens, parsePlanSpecs, resolveTokens, validatePlan } from "./lib/plan.mjs";
import { readMeasures, renderSummary, summarizeMeasure } from "./lib/summarize.mjs";

const TOOL = dirname(fileURLToPath(import.meta.url));

/** 375x667 is the small phone of every before/after; 390x844 is the audit's "phone". */
const DEVICES = {
  small: { width: 375, height: 667, touch: true },
  phone: { width: 390, height: 844, touch: true },
  tablet: { width: 768, height: 1024, touch: true },
  desktop: { width: 1440, height: 900, touch: false },
};

function parseArgs(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) opt[key] = true;
    else opt[key] = argv[++i];
  }
  return opt;
}

function readJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new GuardError(`Cannot read ${what} "${path}": ${e instanceof Error ? e.message : e}`);
  }
}

function loadPlan(spec) {
  const path = /[\\/]|\.json$/.test(spec) ? resolve(spec) : join(TOOL, "plans", `${spec}.json`);
  const plan = readJson(path, "plan");
  const problems = validatePlan(plan);
  if (problems.length) throw new GuardError(`Plan ${spec} is not valid:\n  - ${problems.join("\n  - ")}`);
  return plan;
}

function gitInfo() {
  const run = (args) => {
    try {
      return execFileSync("git", args, { cwd: TOOL, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return null;
    }
  };
  return { commit: run(["rev-parse", "--short", "HEAD"]), branch: run(["rev-parse", "--abbrev-ref", "HEAD"]), dirty: Boolean(run(["status", "--porcelain", "--", "."])) };
}

/** Opens a context that cannot write: every non-GET/HEAD/OPTIONS request is aborted and counted. */
async function newReadOnlyContext(browser, device, opt) {
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: 1,
    hasTouch: device.touch,
    isMobile: false,
    locale: "es-ES",
    reducedMotion: opt.motion ? "no-preference" : "reduce",
    serviceWorkers: "block",
  });
  const counter = { blocked: 0 };
  await ctx.route("**/*", (route) => {
    if (isReadOnlyMethod(route.request().method())) return route.continue();
    counter.blocked++;
    return route.abort("blockedbyclient");
  });
  return { ctx, counter };
}

/** --self-test: proves, against the running server, that a write cannot leave the browser. */
async function selfTest(browser, origin, opt) {
  const { ctx, counter } = await newReadOnlyContext(browser, DEVICES.desktop, opt);
  const page = await ctx.newPage();
  await page.goto(`${origin}/es/auth/login`, { waitUntil: "domcontentloaded" }); // a public page; /api/health answers 204, which a browser cannot show
  const methods = ["POST", "PUT", "PATCH", "DELETE"];
  const outcomes = await page.evaluate(async (list) => {
    const res = [];
    for (const method of list) {
      try {
        await fetch("/api/health", { method, body: method === "DELETE" ? undefined : "x" });
        res.push({ method, reached: true });
      } catch {
        res.push({ method, reached: false });
      }
    }
    return res;
  }, methods);
  await ctx.close();
  const reached = outcomes.filter((o) => o.reached);
  const ok = reached.length === 0 && counter.blocked === methods.length;
  console.log(`self-test: ${ok ? "PASS" : "FAIL"}: ${methods.length} writes tried, ${counter.blocked} blocked in the browser, ${reached.length} reached the server`);
  return ok;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const origin = assertLocalBase(opt.base || "http://localhost:3000");
  const devices = String(opt.devices || "small,tablet,desktop").split(",");
  const langs = String(opt.langs || "es,en").split(",");
  const only = opt.only ? String(opt.only).split(",") : null;
  for (const d of devices) if (!DEVICES[d]) throw new GuardError(`Unknown device "${d}". Use ${Object.keys(DEVICES).join(", ")}.`);

  if (!opt["self-test"] && (!opt.plan || opt.plan === true)) throw new GuardError("Pass --plan <name>[=<test address>][,<name>...]. See README.md.");

  // Everything that can be refused is refused BEFORE a browser starts.
  const specs = opt["self-test"]
    ? []
    : parsePlanSpecs(opt.plan).map((s) => {
        const plan = loadPlan(s.name);
        if (plan.signIn && !s.email) throw new GuardError(`Plan "${plan.name}" signs in: write --plan ${plan.name}=<one of the three test addresses>.`);
        if (!plan.signIn && s.email) throw new GuardError(`Plan "${plan.name}" does not sign in: drop "=${s.email}".`);
        return { plan, email: plan.signIn ? assertTestAddress(s.email) : null };
      });

  const browser = await chromium.launch({ channel: opt.channel || "chrome", headless: true });
  try {
    if (opt["self-test"]) {
      const ok = await selfTest(browser, origin, opt);
      process.exitCode = ok ? 0 : 1;
      return;
    }

    const localPath = opt.local ? resolve(String(opt.local)) : join(TOOL, "local.json");
    const local = existsSync(localPath) ? readJson(localPath, "local file") : { ids: {}, redact: [] };
    const ids = local.ids ?? {};
    const redact = (local.redact ?? []).slice().sort((a, b) => b[0].length - a[0].length);
    const out = resolve(opt.out || join(TOOL, "out", `run-${new Date().toISOString().replace(/[:.]/g, "-")}`));
    mkdirSync(out, { recursive: true });

    const meta = { tool: "ux-capture", base: origin, date: new Date().toISOString(), git: gitInfo(), devices, langs, plans: specs.map((s) => s.plan.name), redactions: redact.length, noShots: Boolean(opt["no-shots"]) };
    writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 1));

    let failed = 0;
    for (const { plan, email } of specs) {
      const planOut = join(out, plan.name);
      mkdirSync(join(planOut, "measure"), { recursive: true });
      const results = [];
      console.log(`\n== plan ${plan.name}${email ? ` as ${email}` : " (not signed in)"} -> ${planOut}`);
      for (const dev of devices) {
        const d = DEVICES[dev];
        const { ctx, counter } = await newReadOnlyContext(browser, d, opt);
        const page = await ctx.newPage();
        const errors = [];
        page.on("console", (m) => {
          if (m.type() === "error") errors.push(m.text().slice(0, 200));
        });
        page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 200)));

        if (plan.signIn) {
          const r = await page.goto(signInUrl(origin, email), { waitUntil: "domcontentloaded" });
          if (!r || !r.ok() || !/^\/(?:(?:es|en)\/)?app(?:\/|$)/.test(new URL(page.url()).pathname)) {
            console.error(`sign-in failed for ${email}: HTTP ${r && r.status()}, ended on ${new URL(page.url()).pathname}. Is the dev server running in development mode and the account seeded (npm run seed:test)?`);
            failed++;
            await ctx.close();
            continue;
          }
        }

        for (const screen of orderScreens(plan.screens)) {
          if (only && !only.includes(screen.id)) continue;
          if (screen.devices && !screen.devices.includes(dev)) continue;
          const { path, missing } = resolveTokens(screen.path, ids);
          for (const lang of screen.langs ?? langs) {
            const fname = captureName(screen, dev, lang);
            if (missing.length) {
              console.log(`${fname}  SKIPPED (no value for ${missing.map((m) => `{{${m}}}`).join(", ")} in local.json)`);
              results.push({ f: fname, skipped: missing });
              continue;
            }
            errors.length = 0;
            const blockedBefore = counter.blocked;
            try {
              const resp = await page.goto(buildTargetUrl(origin, lang, path), { waitUntil: "load", timeout: 60000 });
              await page.waitForTimeout(screen.settle || 1800);
              for (const st of screen.steps ?? []) {
                if (st.click) await page.locator(st.click).first().click({ timeout: 8000 });
                if (st.wait) await page.waitForTimeout(st.wait);
                if (st.scrollTo != null) await page.evaluate((v) => window.scrollTo(0, v), st.scrollTo);
                if (st.press) await page.keyboard.press(st.press);
                if (st.hover) await page.locator(st.hover).first().hover({ timeout: 8000 });
                if (st.eval) await page.evaluate(st.eval);
              }
              await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
              if (redact.length) await page.evaluate(redactPage, redact);
              const m = await page.evaluate(measure);
              Object.assign(m, { status: resp ? resp.status() : null, finalUrl: page.url().replace(origin, ""), consoleErrors: errors.slice(0, 8), blockedWrites: counter.blocked - blockedBefore, id: screen.id, device: dev, lang2: lang, state: screen.state || "", plan: plan.name });
              const evalSource = screen.evalFile ? readFileSync(join(TOOL, "evals", `${screen.evalFile}.js`), "utf8") : screen.eval;
              if (evalSource) {
                try {
                  m.custom = await page.evaluate(evalSource);
                } catch (e) {
                  m.custom = { error: String(e).slice(0, 300) };
                }
              }
              const mfile = join(planOut, "measure", `${fname}.json`);
              writeFileSync(mfile, JSON.stringify(m, null, 1));

              if (!opt["no-shots"]) {
                // 1) fold/: what is seen without scrolling. 2) the whole screen: the app shell scrolls inside a
                //    container, so the viewport is grown by that container's hidden height; the results page has
                //    nested scrollers, so repeat until nothing is hidden (at most 4 rounds, 15000 px).
                mkdirSync(join(planOut, "fold"), { recursive: true });
                await page.screenshot({ path: join(planOut, "fold", `${fname}.png`), fullPage: false, animations: "disabled" });
                let extra = 0;
                if (screen.fullPage !== false) {
                  for (let round = 0; round < 4; round++) {
                    const more = await page.evaluate(hiddenScrollHeight);
                    if (more <= 4) break;
                    extra += more;
                    await page.setViewportSize({ width: d.width, height: Math.min(d.height + extra, 15000) });
                    await page.waitForTimeout(450);
                    if (d.height + extra >= 15000) break;
                  }
                }
                await page.screenshot({ path: join(planOut, `${fname}.png`), fullPage: screen.fullPage !== false, animations: "disabled" });
                if (extra > 0) await page.setViewportSize({ width: d.width, height: d.height });
                m.innerScrollExtra = extra;
                writeFileSync(mfile, JSON.stringify(m, null, 1));
              }
              results.push({ f: fname, status: m.status, final: m.finalUrl, h: m.docHeight, over: m.hOverflow, prim: m.primariesInFold, u44: m.targetsUnder44Count, lc: m.lowContrastCount, err: m.consoleErrors.length, blocked: m.blockedWrites });
              console.log(`${fname}  ${m.status} -> ${m.finalUrl}  h=${m.docHeight} overflow=${m.hOverflow} primInFold=${m.primariesInFold} <44=${m.targetsUnder44Count} lowC=${m.lowContrastCount} err=${m.consoleErrors.length} blockedWrites=${m.blockedWrites}`);
            } catch (e) {
              failed++;
              console.log(`${fname}  FAILED ${String(e).slice(0, 160)}`);
              results.push({ f: fname, failed: String(e).slice(0, 160) });
            }
          }
        }
        await ctx.close();
      }
      writeFileSync(join(planOut, "measure", "_index.json"), JSON.stringify(results, null, 1));
    }

    const measures = readMeasures(out);
    writeFileSync(join(out, "summary.md"), `# ux-capture summary\n\n${meta.git.branch}@${meta.git.commit}${meta.git.dirty ? " (uncommitted changes)" : ""} · ${meta.base} · ${meta.date}\n\n${renderSummary(measures)}`);
    writeFileSync(join(out, "summary.json"), JSON.stringify(Object.fromEntries(Object.entries(measures).map(([k, v]) => [k, summarizeMeasure(v)])), null, 1));
    console.log(`\nsummary: ${join(out, "summary.md")}`);
    if (failed) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e instanceof GuardError ? e.message : e);
  process.exit(e instanceof GuardError ? 2 : 1);
});

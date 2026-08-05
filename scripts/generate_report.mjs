#!/usr/bin/env node
/**
 * generate-report.mjs
 * ---------------------------------------------------------------------------
 * Reads the raw Serenity BDD JSON result files (target/site/serenity/*.json)
 * and builds a single, self-contained HTML report focused on API calls:
 * request/response headers, bodies, status codes, accurate timings and
 * pass/fail results — with tokens/secrets masked as "***".
 *
 * Hierarchy rendered:
 *   Campaign  →  Collection  →  Scenario  →  Test Cases (API calls)
 *
 * Also:
 *   - Persists the JSON used for the report as last-report-run.json
 *   - Keeps only the immediate predecessor (previous-report-run.json)
 *   - Embeds a duration comparison graph (previous run vs current run)
 *
 * USAGE
 *   node generate-report.mjs [serenityJsonDir] [outputHtmlFile]
 *
 *   serenityJsonDir  default: target/site/serenity
 *   outputHtmlFile   default: target/site/custom-report/index.html
 *
 * No npm install required - uses only Node's built-in modules + Chart.js CDN.
 * Requires Node.js 18+.
 * ---------------------------------------------------------------------------
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SERENITY_DIR = path.resolve(process.argv[2] || "target/site/serenity");
const OUTPUT_FILE = path.resolve(
    process.argv[3] || "target/site/custom-report/index.html"
);
const REPORT_DIR = path.dirname(OUTPUT_FILE);
const LAST_RUN_JSON = path.join(REPORT_DIR, "last-report-run.json");
const PREV_RUN_JSON = path.join(REPORT_DIR, "previous-report-run.json");

// ---------------------------------------------------------------------------
// 1. Helpers
// ---------------------------------------------------------------------------

/** Mask tokens / secrets wherever they show up in headers, bodies, cookies. */
function maskSensitive(input) {
    if (input === null || input === undefined) return input;
    let out = String(input);

    out = out.replace(
        /("(?:token|access_token|refresh_token|id_token|api[_-]?key|secret|password|client_secret|authorization)"\s*:\s*")([^"]*)(")/gi,
        "$1***$3"
    );

    out = out.replace(/(Authorization\s*[:=]\s*(?:Bearer|Basic)\s+)\S+/gi, "$1***");

    out = out.replace(
        /((?:^|[;\s=])(?:token|access_token|refresh_token|session|sessionid|jwt)\s*=\s*)[^\s;,"&\r\n]+/gi,
        "$1***"
    );

    out = out.replace(
        /((?:X-Api-Key|Api-Key|X-Auth-Token|X-Access-Token)\s*[:=]\s*)\S+/gi,
        "$1***"
    );

    return out;
}

/** Parse a Serenity header blob into name/value pairs. */
function parseHeaderBlob(blob) {
    if (!blob) return [];
    return blob
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
            const sepIdx = line.search(/[:=]/);
            if (sepIdx === -1) return { name: line, value: "" };
            const name = line.slice(0, sepIdx).trim();
            const value = line.slice(sepIdx + 1).trim();
            return { name, value: maskSensitive(value) };
        });
}

/**
 * Parse Java Instant strings accurately.
 * Examples:
 *   2026-08-03T10:27:49.697740300+04:00[Asia/Dubai]
 *   2026-08-03T10:27:49.697Z
 * Keeps millisecond precision; drops zone-id suffix that Date cannot parse.
 */
function parseJavaInstant(str) {
    if (!str) return null;
    let s = String(str).replace(/\[[^\]]+\]$/, "");
    s = s.replace(/\.(\d{3})\d*/, ".$1");
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

/** ISO-8601 with milliseconds (UTC) for accurate storage / comparison. */
function toIso(d) {
    if (!d || isNaN(d.getTime())) return null;
    return d.toISOString();
}

function fmtDate(d) {
    if (!d) return "-";
    return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
    });
}

function fmtTime(d) {
    if (!d) return "-";
    return (
        d.toLocaleTimeString(undefined, { hour12: false }) +
        "." +
        String(d.getMilliseconds()).padStart(3, "0")
    );
}

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function tryPrettyJson(str) {
    if (!str) return "";
    const masked = maskSensitive(str);
    try {
        return JSON.stringify(JSON.parse(masked), null, 2);
    } catch {
        return masked;
    }
}

/**
 * Recursively flatten Serenity testSteps, collecting leaf steps that are
 * actual REST calls. groupPath becomes the test-case grouping breadcrumb.
 */
function flattenApiCalls(steps, groupPath = []) {
    let calls = [];
    for (const step of steps || []) {
        if (step.restQuery) {
            calls.push({ groupPath: [...groupPath], step });
        }
        if (Array.isArray(step.children) && step.children.length) {
            calls = calls.concat(
                flattenApiCalls(step.children, [...groupPath, step.description])
            );
        }
    }
    return calls;
}

// ---------------------------------------------------------------------------
// 2. Load & transform Serenity JSON result files
// ---------------------------------------------------------------------------

if (!fs.existsSync(SERENITY_DIR)) {
    console.error(`Could not find Serenity results directory: ${SERENITY_DIR}`);
    process.exit(1);
}

const jsonFiles = fs
    .readdirSync(SERENITY_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(SERENITY_DIR, f));

/** Flat list of scenarios (each Serenity result file that has testSteps). */
const flatScenarios = [];

for (const file of jsonFiles) {
    let data;
    try {
        data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        continue;
    }
    if (!Array.isArray(data.testSteps)) continue;

    const apiCalls = flattenApiCalls(data.testSteps).map(({ groupPath, step }) => {
        const rq = step.restQuery;

        // Accurate timing: prefer step.startTime; duration from Serenity
        const start = parseJavaInstant(step.startTime);
        const durationMs =
            typeof step.duration === "number" && step.duration >= 0
                ? step.duration
                : 0;
        const end = start ? new Date(start.getTime() + durationMs) : null;

        // Fallback: some Serenity builds put timing on the restQuery itself
        const rqStart = parseJavaInstant(rq.startTime || rq.requestTime);
        const rqDuration =
            typeof rq.duration === "number" ? rq.duration : durationMs;
        const effectiveStart = start || rqStart;
        const effectiveDuration = start ? durationMs : rqDuration;
        const effectiveEnd = effectiveStart
            ? new Date(effectiveStart.getTime() + effectiveDuration)
            : null;

        return {
            group: groupPath.filter(Boolean).join(" \u203a "),
            method: rq.method,
            url: rq.path,
            statusCode: rq.statusCode,
            result: step.result,
            dateCalled: fmtDate(effectiveStart),
            timeCalled: fmtTime(effectiveStart),
            timeResponded: fmtTime(effectiveEnd),
            durationMs: effectiveDuration,
            startIso: toIso(effectiveStart),
            endIso: toIso(effectiveEnd),
            requestHeaders: parseHeaderBlob(rq.requestHeaders),
            requestCookies: parseHeaderBlob(rq.requestCookies),
            requestBody: tryPrettyJson(rq.content),
            responseHeaders: parseHeaderBlob(rq.responseHeaders),
            responseCookies: parseHeaderBlob(rq.responseCookies),
            responseBody: tryPrettyJson(rq.responseBody),
        };
    });

    const scenarioStart = parseJavaInstant(data.startTime);
    const scenarioEnd = parseJavaInstant(data.endTime);
    let scenarioDurationMs = data.duration;
    if (
        (scenarioDurationMs == null || scenarioDurationMs < 0) &&
        scenarioStart &&
        scenarioEnd
    ) {
        scenarioDurationMs = scenarioEnd.getTime() - scenarioStart.getTime();
    }
    scenarioDurationMs = scenarioDurationMs ?? 0;

    flatScenarios.push({
        title: data.title || data.name || "Unnamed scenario",
        testCaseName: data.testCaseName || "",
        methodName: data.methodName || "",
        feature: data.userStory?.storyName || data.featureName || "Default Collection",
        capability:
            data.userStory?.pathElements?.[0]?.description ||
            data.capability ||
            "API Campaign",
        result: data.result,
        start: scenarioStart,
        end: scenarioEnd,
        startIso: toIso(scenarioStart),
        endIso: toIso(scenarioEnd),
        durationMs: scenarioDurationMs,
        apiCalls,
        sourceFile: path.basename(file),
    });
}

flatScenarios.sort(
    (a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0)
);

let callCounter = 0;
for (const scenario of flatScenarios) {
    for (const call of scenario.apiCalls) {
        call.callId = `call-${callCounter++}`;
    }
}

// ---------------------------------------------------------------------------
// 3. Build hierarchy: Campaign → Collection → Scenario → Test Cases
// ---------------------------------------------------------------------------

function buildHierarchy(scenarios) {
    const campaignMap = new Map();

    for (const sc of scenarios) {
        const campaignName = sc.capability || "API Campaign";
        const collectionName = sc.feature || "Default Collection";

        if (!campaignMap.has(campaignName)) {
            campaignMap.set(campaignName, {
                name: campaignName,
                collections: new Map(),
            });
        }
        const campaign = campaignMap.get(campaignName);

        if (!campaign.collections.has(collectionName)) {
            campaign.collections.set(collectionName, {
                name: collectionName,
                scenarios: [],
            });
        }
        const collection = campaign.collections.get(collectionName);

        collection.scenarios.push({
            title: sc.title,
            testCaseName: sc.testCaseName,
            methodName: sc.methodName,
            result: sc.result,
            startIso: sc.startIso,
            endIso: sc.endIso,
            durationMs: sc.durationMs,
            dateCalled: fmtDate(sc.start),
            timeCalled: fmtTime(sc.start),
            timeResponded: fmtTime(sc.end),
            testCases: sc.apiCalls,
            sourceFile: sc.sourceFile,
        });
    }

    const campaigns = [];
    for (const [, camp] of campaignMap) {
        const collections = [];
        for (const [, coll] of camp.collections) {
            const collDuration = coll.scenarios.reduce(
                (n, s) => n + (s.durationMs || 0),
                0
            );
            const collResults = coll.scenarios.map((s) => s.result);
            const collResult = collResults.every((r) => r === "SUCCESS")
                ? "SUCCESS"
                : collResults.some((r) => r === "FAILURE" || r === "ERROR")
                    ? "FAILURE"
                    : collResults[0] || "UNKNOWN";

            collections.push({
                name: coll.name,
                result: collResult,
                durationMs: collDuration,
                scenarioCount: coll.scenarios.length,
                testCaseCount: coll.scenarios.reduce(
                    (n, s) => n + s.testCases.length,
                    0
                ),
                scenarios: coll.scenarios,
            });
        }

        const campDuration = collections.reduce(
            (n, c) => n + (c.durationMs || 0),
            0
        );
        const campResults = collections.map((c) => c.result);
        const campResult = campResults.every((r) => r === "SUCCESS")
            ? "SUCCESS"
            : campResults.some((r) => r === "FAILURE" || r === "ERROR")
                ? "FAILURE"
                : campResults[0] || "UNKNOWN";

        campaigns.push({
            name: camp.name,
            result: campResult,
            durationMs: campDuration,
            collectionCount: collections.length,
            scenarioCount: collections.reduce(
                (n, c) => n + c.scenarioCount,
                0
            ),
            testCaseCount: collections.reduce(
                (n, c) => n + c.testCaseCount,
                0
            ),
            collections,
        });
    }

    return campaigns;
}

const campaigns = buildHierarchy(flatScenarios);

const summary = {
    totalCampaigns: campaigns.length,
    totalCollections: campaigns.reduce((n, c) => n + c.collectionCount, 0),
    totalScenarios: flatScenarios.length,
    totalTestCases: flatScenarios.reduce((n, s) => n + s.apiCalls.length, 0),
    passed: flatScenarios.filter((s) => s.result === "SUCCESS").length,
    failed: flatScenarios.filter(
        (s) => s.result === "FAILURE" || s.result === "ERROR"
    ).length,
    other: flatScenarios.filter(
        (s) => !["SUCCESS", "FAILURE", "ERROR"].includes(s.result)
    ).length,
    totalDurationMs: flatScenarios.reduce((n, s) => n + (s.durationMs || 0), 0),
    generatedAt: new Date().toISOString(),
    runId: `run-${Date.now()}`,
};

// ---------------------------------------------------------------------------
// 4. Persist last-run JSON + keep only immediate predecessor
// ---------------------------------------------------------------------------

/**
 * On every successful generation:
 *   1. If last-report-run.json exists → copy it to previous-report-run.json
 *      (this becomes the sole predecessor for the graph)
 *   2. Write current report data as last-report-run.json
 *   3. Older history is discarded (only previous + current remain)
 */
function persistRunJson(currentPayload) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    if (fs.existsSync(LAST_RUN_JSON)) {
        try {
            fs.copyFileSync(LAST_RUN_JSON, PREV_RUN_JSON);
        } catch (err) {
            console.warn("Could not promote last-run to previous:", err.message);
        }
    }

    fs.writeFileSync(
        LAST_RUN_JSON,
        JSON.stringify(currentPayload, null, 2),
        "utf8"
    );
}

function loadPreviousRun() {
    if (!fs.existsSync(PREV_RUN_JSON)) return null;
    try {
        return JSON.parse(fs.readFileSync(PREV_RUN_JSON, "utf8"));
    } catch {
        return null;
    }
}

const currentRunPayload = {
    runId: summary.runId,
    generatedAt: summary.generatedAt,
    summary: {
        totalCampaigns: summary.totalCampaigns,
        totalCollections: summary.totalCollections,
        totalScenarios: summary.totalScenarios,
        totalTestCases: summary.totalTestCases,
        passed: summary.passed,
        failed: summary.failed,
        other: summary.other,
        totalDurationMs: summary.totalDurationMs,
    },
    campaigns,
    scenarioDurations: flatScenarios.map((s) => ({
        title: s.title,
        durationMs: s.durationMs,
        result: s.result,
        testCaseCount: s.apiCalls.length,
    })),
    testCaseDurations: flatScenarios.flatMap((s) =>
        s.apiCalls.map((c) => ({
            scenario: s.title,
            method: c.method,
            url: c.url,
            durationMs: c.durationMs,
            result: c.result,
            startIso: c.startIso,
            endIso: c.endIso,
        }))
    ),
};

persistRunJson(currentRunPayload);
const previousRun = loadPreviousRun();

// ---------------------------------------------------------------------------
// 5. Render helpers
// ---------------------------------------------------------------------------

function statusBadgeClass(result) {
    if (result === "SUCCESS") return "badge-pass";
    if (result === "FAILURE" || result === "ERROR") return "badge-fail";
    return "badge-neutral";
}

function methodBadgeClass(method) {
    const m = (method || "").toUpperCase();
    return (
        "method-" +
        (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m)
            ? m.toLowerCase()
            : "other")
    );
}

function statusCodeClass(code) {
    if (!code) return "";
    if (code >= 200 && code < 300) return "code-2xx";
    if (code >= 300 && code < 400) return "code-3xx";
    if (code >= 400 && code < 500) return "code-4xx";
    if (code >= 500) return "code-5xx";
    return "";
}

function renderHeaderTable(headers) {
    if (!headers.length) return `<p class="empty">None</p>`;
    return `<table class="kv-table"><tbody>${headers
        .map(
            (h) =>
                `<tr><td class="kv-key">${escapeHtml(h.name)}</td><td class="kv-val">${escapeHtml(h.value)}</td></tr>`
        )
        .join("")}</tbody></table>`;
}

function renderBody(body) {
    if (!body) return `<p class="empty">Empty body</p>`;
    return `<pre class="body-block">${escapeHtml(body)}</pre>`;
}

function renderAssertions(call) {
    const items = [
        {
            label: "Step result",
            pass: call.result === "SUCCESS",
            text: call.result,
        },
        {
            label: "HTTP status code",
            pass: call.statusCode >= 200 && call.statusCode < 400,
            text: `Response returned ${call.statusCode}`,
        },
    ];
    return `<ul class="assertion-list">${items
        .map(
            (i) =>
                `<li class="${i.pass ? "assert-pass" : "assert-fail"}"><span class="assert-icon">${
                    i.pass ? "\u2713" : "\u2717"
                }</span><span class="assert-label">${escapeHtml(i.label)}:</span> ${escapeHtml(i.text)}</li>`
        )
        .join("")}</ul>`;
}

function renderTestCase(call) {
    return `
  <div class="api-call test-case" id="${call.callId}">
    <div class="api-call-header">
      <span class="method-badge ${methodBadgeClass(call.method)}">${escapeHtml(call.method)}</span>
      <span class="api-url">${escapeHtml(call.url)}</span>
      <span class="status-code ${statusCodeClass(call.statusCode)}">${call.statusCode ?? "-"}</span>
      <span class="badge ${statusBadgeClass(call.result)}">${escapeHtml(call.result)}</span>
    </div>
    ${call.group ? `<div class="api-group">Step: ${escapeHtml(call.group)}</div>` : ""}

    <div class="timing-row">
      <div class="timing-item"><span class="timing-label">Date called</span><span class="timing-value">${escapeHtml(call.dateCalled)}</span></div>
      <div class="timing-item"><span class="timing-label">Time called</span><span class="timing-value" title="${escapeHtml(call.startIso || "")}">${escapeHtml(call.timeCalled)}</span></div>
      <div class="timing-item"><span class="timing-label">Time responded</span><span class="timing-value" title="${escapeHtml(call.endIso || "")}">${escapeHtml(call.timeResponded)}</span></div>
      <div class="timing-item"><span class="timing-label">Duration</span><span class="timing-value">${call.durationMs} ms</span></div>
    </div>
    ${call.startIso ? `<div class="iso-row"><span class="iso-label">ISO start</span><code>${escapeHtml(call.startIso)}</code><span class="iso-label">ISO end</span><code>${escapeHtml(call.endIso || "-")}</code></div>` : ""}

    <details class="dropdown" open>
      <summary>Assertions</summary>
      <div class="dropdown-body">${renderAssertions(call)}</div>
    </details>

    <details class="dropdown">
      <summary>Request Headers <span class="count">${call.requestHeaders.length}</span></summary>
      <div class="dropdown-body">${renderHeaderTable(call.requestHeaders)}</div>
    </details>

    ${
        call.requestCookies.length
            ? `
    <details class="dropdown">
      <summary>Request Cookies <span class="count">${call.requestCookies.length}</span></summary>
      <div class="dropdown-body">${renderHeaderTable(call.requestCookies)}</div>
    </details>`
            : ""
    }

    <details class="dropdown">
      <summary>Request Body</summary>
      <div class="dropdown-body">${renderBody(call.requestBody)}</div>
    </details>

    <details class="dropdown">
      <summary>Response Headers <span class="count">${call.responseHeaders.length}</span></summary>
      <div class="dropdown-body">${renderHeaderTable(call.responseHeaders)}</div>
    </details>

    ${
        call.responseCookies.length
            ? `
    <details class="dropdown">
      <summary>Response Cookies <span class="count">${call.responseCookies.length}</span></summary>
      <div class="dropdown-body">${renderHeaderTable(call.responseCookies)}</div>
    </details>`
            : ""
    }

    <details class="dropdown">
      <summary>Response Body</summary>
      <div class="dropdown-body">${renderBody(call.responseBody)}</div>
    </details>
  </div>`;
}

function renderScenario(scenario, scenarioIdx, collectionIdx, campaignIdx) {
    const id = `scenario-${campaignIdx}-${collectionIdx}-${scenarioIdx}`;
    return `
  <section class="scenario" id="${id}" data-result="${escapeHtml(scenario.result)}">
    <div class="scenario-header">
      <div class="scenario-title-row">
        <span class="level-tag">Scenario</span>
        <span class="badge ${statusBadgeClass(scenario.result)}">${escapeHtml(scenario.result)}</span>
        <h3 class="scenario-title">${escapeHtml(scenario.title)}</h3>
      </div>
      <div class="scenario-meta">
        <span class="meta-chip">${scenario.testCases.length} test case${scenario.testCases.length === 1 ? "" : "s"}</span>
        <span class="meta-chip" title="${escapeHtml(scenario.startIso || "")}">${escapeHtml(scenario.dateCalled)} ${escapeHtml(scenario.timeCalled)}</span>
        <span class="meta-chip">Duration: ${scenario.durationMs} ms</span>
        ${scenario.methodName ? `<span class="meta-chip">${escapeHtml(scenario.methodName)}</span>` : ""}
      </div>
    </div>
    <div class="scenario-body">
      <div class="test-cases-label">Test Cases (API Calls)</div>
      ${scenario.testCases.map((c) => renderTestCase(c)).join("")}
    </div>
  </section>`;
}

function renderCollection(collection, collectionIdx, campaignIdx) {
    const id = `collection-${campaignIdx}-${collectionIdx}`;
    return `
  <div class="collection" id="${id}" data-result="${escapeHtml(collection.result)}">
    <div class="collection-header">
      <div class="collection-title-row">
        <span class="level-tag collection-tag">Collection</span>
        <span class="badge ${statusBadgeClass(collection.result)}">${escapeHtml(collection.result)}</span>
        <h2 class="collection-title">${escapeHtml(collection.name)}</h2>
      </div>
      <div class="scenario-meta">
        <span class="meta-chip">${collection.scenarioCount} scenario${collection.scenarioCount === 1 ? "" : "s"}</span>
        <span class="meta-chip">${collection.testCaseCount} test case${collection.testCaseCount === 1 ? "" : "s"}</span>
        <span class="meta-chip">Duration: ${collection.durationMs} ms</span>
      </div>
    </div>
    <div class="collection-body">
      ${collection.scenarios
        .map((s, si) => renderScenario(s, si, collectionIdx, campaignIdx))
        .join("")}
    </div>
  </div>`;
}

function renderCampaign(campaign, campaignIdx) {
    const id = `campaign-${campaignIdx}`;
    return `
  <div class="campaign" id="${id}" data-result="${escapeHtml(campaign.result)}">
    <div class="campaign-header">
      <div class="campaign-title-row">
        <span class="level-tag campaign-tag">Campaign</span>
        <span class="badge ${statusBadgeClass(campaign.result)}">${escapeHtml(campaign.result)}</span>
        <h1 class="campaign-title">${escapeHtml(campaign.name)}</h1>
      </div>
      <div class="scenario-meta">
        <span class="meta-chip">${campaign.collectionCount} collection${campaign.collectionCount === 1 ? "" : "s"}</span>
        <span class="meta-chip">${campaign.scenarioCount} scenario${campaign.scenarioCount === 1 ? "" : "s"}</span>
        <span class="meta-chip">${campaign.testCaseCount} test case${campaign.testCaseCount === 1 ? "" : "s"}</span>
        <span class="meta-chip">Duration: ${campaign.durationMs} ms</span>
      </div>
    </div>
    <div class="campaign-body">
      ${campaign.collections
        .map((c, ci) => renderCollection(c, ci, campaignIdx))
        .join("")}
    </div>
  </div>`;
}

/** Sidebar: Campaign → Collection → Scenario → Test Cases */
function renderSidebar(campaigns) {
    let totalCalls = 0;
    campaigns.forEach((camp) => {
        camp.collections.forEach((coll) => {
            coll.scenarios.forEach((sc) => {
                totalCalls += sc.testCases.length;
            });
        });
    });

    return `
  <nav class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">Navigation</span>
      <span class="sidebar-count">${totalCalls}</span>
    </div>
    <div class="sidebar-list">
      ${campaigns
        .map(
            (camp, cIdx) => `
        <div class="sidebar-campaign">
          <a class="sidebar-campaign-title" href="#campaign-${cIdx}">${escapeHtml(camp.name)}</a>
          ${camp.collections
                .map(
                    (coll, colIdx) => `
            <div class="sidebar-collection">
              <a class="sidebar-collection-title" href="#collection-${cIdx}-${colIdx}">${escapeHtml(coll.name)}</a>
              ${coll.scenarios
                        .map(
                            (sc, sIdx) => `
                <div class="sidebar-group">
                  <div class="sidebar-scenario-title" title="${escapeHtml(sc.title)}">${escapeHtml(sc.title)}</div>
                  ${sc.testCases
                                .map(
                                    (c) => `
                    <a class="sidebar-item" href="#${c.callId}" data-target="${c.callId}">
                      <span class="sidebar-method ${methodBadgeClass(c.method)}">${escapeHtml(c.method)}</span>
                      <span class="sidebar-url">${escapeHtml((c.url || "").replace(/^https?:\/\//, ""))}</span>
                      <span class="sidebar-code ${statusCodeClass(c.statusCode)}">${c.statusCode ?? "-"}</span>
                    </a>`
                                )
                                .join("")}
                </div>`
                        )
                        .join("")}
            </div>`
                )
                .join("")}
        </div>`
        )
        .join("")}
    </div>
  </nav>`;
}

// ---------------------------------------------------------------------------
// 6. Duration comparison graph data (previous vs current)
// ---------------------------------------------------------------------------

function buildGraphData(current, previous) {
    const labels = [];
    const currentDurations = [];
    const previousDurations = [];

    const prevMap = new Map();
    if (previous?.scenarioDurations) {
        for (const s of previous.scenarioDurations) {
            prevMap.set(s.title, s.durationMs);
        }
    }

    for (const s of current.scenarioDurations || []) {
        labels.push(s.title.length > 40 ? s.title.slice(0, 37) + "…" : s.title);
        currentDurations.push(s.durationMs);
        previousDurations.push(prevMap.has(s.title) ? prevMap.get(s.title) : null);
    }

    if (previous?.scenarioDurations) {
        const currentTitles = new Set(
            (current.scenarioDurations || []).map((s) => s.title)
        );
        for (const s of previous.scenarioDurations) {
            if (!currentTitles.has(s.title)) {
                labels.push(
                    (s.title.length > 40 ? s.title.slice(0, 37) + "…" : s.title) +
                    " (prev only)"
                );
                currentDurations.push(null);
                previousDurations.push(s.durationMs);
            }
        }
    }

    return {
        labels,
        currentDurations,
        previousDurations,
        hasPrevious: !!previous,
        previousGeneratedAt: previous?.generatedAt || null,
        currentGeneratedAt: current.generatedAt,
        currentTotalMs: current.summary?.totalDurationMs ?? 0,
        previousTotalMs: previous?.summary?.totalDurationMs ?? null,
    };
}

const graphData = buildGraphData(currentRunPayload, previousRun);

// ---------------------------------------------------------------------------
// 7. Full HTML
// ---------------------------------------------------------------------------

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>API Test Report — Campaign Hierarchy</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg: #0f1115;
    --panel: #171a21;
    --panel-2: #1e222b;
    --border: #2a2f3a;
    --text: #e6e9ef;
    --text-dim: #9aa3b2;
    --accent: #6ea8fe;
    --pass: #3ddc97;
    --fail: #ff6b6b;
    --neutral: #f5c451;
    --get: #3ddc97;
    --post: #6ea8fe;
    --put: #f5c451;
    --patch: #c792ea;
    --delete: #ff6b6b;
    --campaign: #a78bfa;
    --collection: #38bdf8;
    --radius: 10px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    padding: 0 0 60px;
  }
  header.top {
    position: sticky;
    top: 0;
    z-index: 10;
    background: linear-gradient(180deg, var(--panel) 0%, rgba(23,26,33,0.96) 100%);
    border-bottom: 1px solid var(--border);
    padding: 20px 32px;
    backdrop-filter: blur(6px);
  }
  header.top h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: 0.2px; }
  header.top .subtitle { color: var(--text-dim); font-size: 13px; }

  .summary-bar {
    display: flex;
    gap: 12px;
    margin-top: 16px;
    flex-wrap: wrap;
  }
  .summary-card {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 16px;
    min-width: 100px;
  }
  .summary-card .num { font-size: 20px; font-weight: 700; }
  .summary-card .label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; }
  .summary-card.pass .num { color: var(--pass); }
  .summary-card.fail .num { color: var(--fail); }

  .controls {
    display: flex;
    gap: 8px;
    margin-top: 16px;
    flex-wrap: wrap;
    align-items: center;
  }
  .controls input[type=text] {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    padding: 8px 12px;
    font-size: 13px;
    min-width: 240px;
  }
  .controls button {
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    cursor: pointer;
  }
  .controls button:hover { border-color: var(--accent); color: var(--accent); }
  .controls button.active { border-color: var(--accent); color: var(--accent); }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    width: 300px;
    height: 100vh;
    overflow-y: auto;
    border-right: 1px solid var(--border);
    background: var(--panel);
    padding-bottom: 24px;
    z-index: 20;
  }
  .content-area { margin-left: 300px; }
  main { padding: 24px 32px; max-width: 1200px; }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 10px;
    position: sticky;
    top: 0;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    z-index: 1;
  }
  .sidebar-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); }
  .sidebar-count {
    font-size: 11px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    padding: 2px 8px;
    border-radius: 999px;
    color: var(--text-dim);
  }
  .sidebar-list { padding: 8px; }
  .sidebar-campaign { margin-bottom: 12px; }
  .sidebar-campaign-title {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: var(--campaign);
    padding: 6px 8px 4px;
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .sidebar-collection { margin-left: 6px; }
  .sidebar-collection-title {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--collection);
    padding: 4px 8px 2px;
    text-decoration: none;
  }
  .sidebar-group { margin-bottom: 6px; margin-left: 4px; }
  .sidebar-scenario-title {
    font-size: 10.5px;
    color: var(--text-dim);
    padding: 6px 8px 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .sidebar-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 6px;
    text-decoration: none;
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .sidebar-item:hover { background: var(--panel-2); }
  .sidebar-item.active { background: rgba(110,168,254,0.14); box-shadow: inset 2px 0 0 var(--accent); }
  .sidebar-method {
    font-size: 9.5px;
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 4px;
    color: #0f1115;
    flex-shrink: 0;
    min-width: 34px;
    text-align: center;
  }
  .sidebar-url {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    color: var(--text-dim);
  }
  .sidebar-code { font-size: 10.5px; font-family: monospace; flex-shrink: 0; }

  .api-call.highlight { animation: pulseHighlight 1.4s ease; }
  @keyframes pulseHighlight {
    0% { box-shadow: 0 0 0 2px var(--accent); }
    100% { box-shadow: 0 0 0 0 transparent; }
  }

  @media (max-width: 960px) {
    .sidebar { display: none; }
    .content-area { margin-left: 0; }
  }

  .campaign {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 28px;
    overflow: hidden;
    border-left: 4px solid var(--campaign);
  }
  .campaign-header { padding: 18px 22px; border-bottom: 1px solid var(--border); background: rgba(167,139,250,0.06); }
  .campaign-title-row, .collection-title-row, .scenario-title-row {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .campaign-title { font-size: 20px; margin: 0; }
  .campaign-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 16px; }

  .collection {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    border-left: 3px solid var(--collection);
  }
  .collection-header { padding: 14px 18px; border-bottom: 1px solid var(--border); }
  .collection-title { font-size: 16px; margin: 0; }
  .collection-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 14px; }

  .scenario {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .scenario-header { padding: 14px 16px; border-bottom: 1px solid var(--border); }
  .scenario-title { font-size: 15px; margin: 0; }
  .scenario-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .scenario-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }

  .test-cases-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-dim);
    font-weight: 600;
    margin-bottom: 2px;
  }

  .level-tag {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text-dim);
  }
  .campaign-tag { color: var(--campaign); border-color: rgba(167,139,250,0.4); }
  .collection-tag { color: var(--collection); border-color: rgba(56,189,248,0.4); }

  .meta-chip {
    font-size: 11px;
    color: var(--text-dim);
    background: var(--panel-2);
    border: 1px solid var(--border);
    padding: 3px 9px;
    border-radius: 999px;
  }

  .badge {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .badge-pass { background: rgba(61,220,151,0.15); color: var(--pass); }
  .badge-fail { background: rgba(255,107,107,0.15); color: var(--fail); }
  .badge-neutral { background: rgba(245,196,81,0.15); color: var(--neutral); }

  .api-call, .test-case {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
  }
  .api-call-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .api-url { font-family: "SFMono-Regular", Consolas, Menlo, monospace; font-size: 13px; word-break: break-all; }
  .api-group { font-size: 11px; color: var(--text-dim); margin-top: 4px; }

  .method-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
    color: #0f1115;
  }
  .method-get { background: var(--get); }
  .method-post { background: var(--post); }
  .method-put { background: var(--put); }
  .method-patch { background: var(--patch); }
  .method-delete { background: var(--delete); }
  .method-other { background: var(--text-dim); }

  .status-code { font-family: monospace; font-size: 13px; font-weight: 700; padding: 2px 8px; border-radius: 6px; }
  .code-2xx { color: var(--pass); background: rgba(61,220,151,0.12); }
  .code-3xx { color: var(--neutral); background: rgba(245,196,81,0.12); }
  .code-4xx, .code-5xx { color: var(--fail); background: rgba(255,107,107,0.12); }

  .timing-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin: 12px 0 8px;
  }
  @media (max-width: 700px) {
    .timing-row { grid-template-columns: repeat(2, 1fr); }
  }
  .timing-item {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .timing-label { display: block; font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
  .timing-value { display: block; font-size: 13px; font-family: monospace; margin-top: 2px; }

  .iso-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    font-size: 11px;
    color: var(--text-dim);
    margin-bottom: 8px;
  }
  .iso-row code {
    font-size: 11px;
    background: var(--panel);
    border: 1px solid var(--border);
    padding: 2px 6px;
    border-radius: 4px;
    color: var(--accent);
  }
  .iso-label { text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; }

  details.dropdown {
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-top: 8px;
    background: var(--panel);
    overflow: hidden;
  }
  details.dropdown summary {
    cursor: pointer;
    padding: 9px 12px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-dim);
    list-style: none;
    display: flex;
    align-items: center;
    gap: 8px;
    user-select: none;
  }
  details.dropdown summary::-webkit-details-marker { display: none; }
  details.dropdown summary::before {
    content: "\\25B8";
    display: inline-block;
    transition: transform 0.15s ease;
    color: var(--accent);
  }
  details.dropdown[open] summary::before { transform: rotate(90deg); }
  details.dropdown summary .count {
    font-size: 10px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    padding: 1px 7px;
    border-radius: 999px;
  }
  .dropdown-body { padding: 4px 14px 12px; border-top: 1px solid var(--border); }

  .kv-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
  .kv-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  .kv-key { color: var(--accent); font-family: monospace; white-space: nowrap; width: 1%; }
  .kv-val { font-family: monospace; word-break: break-all; color: var(--text); }

  .body-block {
    background: #0b0d11;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    font-size: 12.5px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: 8px;
  }
  .empty { color: var(--text-dim); font-size: 12.5px; font-style: italic; margin-top: 8px; }

  .assertion-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .assertion-list li { font-size: 12.5px; display: flex; align-items: center; gap: 8px; }
  .assert-icon { font-weight: 700; width: 16px; text-align: center; }
  .assert-pass .assert-icon { color: var(--pass); }
  .assert-fail .assert-icon { color: var(--fail); }
  .assert-label { color: var(--text-dim); }

  .graph-section {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px 22px;
    margin-bottom: 28px;
  }
  .graph-section h2 {
    margin: 0 0 6px;
    font-size: 16px;
  }
  .graph-meta {
    font-size: 12px;
    color: var(--text-dim);
    margin-bottom: 16px;
  }
  .graph-wrap {
    position: relative;
    height: 320px;
    max-width: 100%;
  }
  .graph-totals {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    margin-top: 14px;
  }
  .graph-total-chip {
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 8px;
    background: var(--panel-2);
    border: 1px solid var(--border);
  }
  .graph-total-chip strong { color: var(--accent); }

  footer { text-align: center; color: var(--text-dim); font-size: 11px; padding: 30px 0 10px; }
</style>
</head>
<body>
  ${renderSidebar(campaigns)}

  <div class="content-area">
    <header class="top">
      <h1>API Test Report</h1>
      <div class="subtitle">
        Generated ${escapeHtml(new Date(summary.generatedAt).toLocaleString())}
        · Hierarchy: Campaign → Collection → Scenario → Test Cases
        · Run ID: ${escapeHtml(summary.runId)}
      </div>
      <div class="summary-bar">
        <div class="summary-card"><div class="num">${summary.totalCampaigns}</div><div class="label">Campaigns</div></div>
        <div class="summary-card"><div class="num">${summary.totalCollections}</div><div class="label">Collections</div></div>
        <div class="summary-card"><div class="num">${summary.totalScenarios}</div><div class="label">Scenarios</div></div>
        <div class="summary-card"><div class="num">${summary.totalTestCases}</div><div class="label">Test Cases</div></div>
        <div class="summary-card pass"><div class="num">${summary.passed}</div><div class="label">Passed</div></div>
        <div class="summary-card fail"><div class="num">${summary.failed}</div><div class="label">Failed</div></div>
        <div class="summary-card"><div class="num">${summary.totalDurationMs}</div><div class="label">Total ms</div></div>
      </div>
      <div class="controls">
        <input type="text" id="searchBox" placeholder="Search campaign, collection, scenario, URL, method..." />
        <button data-filter="all" class="active">All</button>
        <button data-filter="SUCCESS">Passed only</button>
        <button data-filter="FAILURE">Failed only</button>
        <button id="expandAll">Expand all</button>
        <button id="collapseAll">Collapse all</button>
      </div>
    </header>

    <main id="mainContainer">
      <section class="graph-section" id="durationGraphSection">
        <h2>Duration Comparison</h2>
        <div class="graph-meta">
          ${
    graphData.hasPrevious
        ? `Comparing <strong>previous run</strong> (${escapeHtml(
            graphData.previousGeneratedAt
                ? new Date(graphData.previousGeneratedAt).toLocaleString()
                : "unknown"
        )}) vs <strong>current run</strong> (${escapeHtml(
            new Date(graphData.currentGeneratedAt).toLocaleString()
        )}). Only the immediate predecessor is kept.`
        : `No previous run found yet. Re-run the tests and regenerate the report to unlock the comparison graph. Current run: ${escapeHtml(
            new Date(graphData.currentGeneratedAt).toLocaleString()
        )}.`
}
        </div>
        <div class="graph-wrap">
          <canvas id="durationChart"></canvas>
        </div>
        <div class="graph-totals">
          <div class="graph-total-chip">Current total: <strong>${graphData.currentTotalMs} ms</strong></div>
          ${
    graphData.previousTotalMs != null
        ? `<div class="graph-total-chip">Previous total: <strong>${graphData.previousTotalMs} ms</strong></div>
                     <div class="graph-total-chip">Delta: <strong>${
            graphData.currentTotalMs - graphData.previousTotalMs
        } ms</strong></div>`
        : ""
}
        </div>
      </section>

      ${campaigns.map((c, i) => renderCampaign(c, i)).join("")}

      <footer>
        Tokens and secrets are automatically masked as ***.
        Last run JSON saved to <code>last-report-run.json</code>;
        predecessor kept as <code>previous-report-run.json</code> only.
      </footer>
    </main>
  </div>

<script>
  const searchBox = document.getElementById('searchBox');
  const scenarios = Array.from(document.querySelectorAll('.scenario'));
  const collections = Array.from(document.querySelectorAll('.collection'));
  const campaignEls = Array.from(document.querySelectorAll('.campaign'));
  const filterButtons = Array.from(document.querySelectorAll('.controls button[data-filter]'));
  let activeFilter = 'all';

  function applyFilters() {
    const term = searchBox.value.trim().toLowerCase();

    scenarios.forEach(sc => {
      const matchesFilter = activeFilter === 'all' || sc.dataset.result === activeFilter
        || (activeFilter === 'FAILURE' && (sc.dataset.result === 'FAILURE' || sc.dataset.result === 'ERROR'));
      const matchesSearch = !term || sc.textContent.toLowerCase().includes(term);
      sc.style.display = (matchesFilter && matchesSearch) ? '' : 'none';
    });

    collections.forEach(col => {
      const visibleScenarios = col.querySelectorAll('.scenario:not([style*="display: none"])');
      col.style.display = visibleScenarios.length ? '' : 'none';
    });
    campaignEls.forEach(camp => {
      const visibleCols = camp.querySelectorAll('.collection:not([style*="display: none"])');
      camp.style.display = visibleCols.length ? '' : 'none';
    });
  }

  searchBox.addEventListener('input', applyFilters);
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilters();
    });
  });

  document.getElementById('expandAll').addEventListener('click', () => {
    document.querySelectorAll('details.dropdown').forEach(d => d.open = true);
  });
  document.getElementById('collapseAll').addEventListener('click', () => {
    document.querySelectorAll('details.dropdown').forEach(d => d.open = false);
  });

  const sidebarItems = Array.from(document.querySelectorAll('.sidebar-item'));
  sidebarItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.dataset.target;
      const target = document.getElementById(targetId);
      if (!target) return;

      searchBox.value = '';
      activeFilter = 'all';
      filterButtons.forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
      applyFilters();

      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.remove('highlight');
      void target.offsetWidth;
      target.classList.add('highlight');

      sidebarItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      history.replaceState(null, '', '#' + targetId);
    });
  });

  const callEls = Array.from(document.querySelectorAll('.api-call'));
  if ('IntersectionObserver' in window && callEls.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          sidebarItems.forEach(i => i.classList.toggle('active', i.dataset.target === id));
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
    callEls.forEach(el => observer.observe(el));
  }

  const graphPayload = ${JSON.stringify(graphData)};

  (function initChart() {
    const ctx = document.getElementById('durationChart');
    if (!ctx || typeof Chart === 'undefined') return;

    const datasets = [
      {
        label: 'Current run (ms)',
        data: graphPayload.currentDurations,
        backgroundColor: 'rgba(110, 168, 254, 0.65)',
        borderColor: 'rgba(110, 168, 254, 1)',
        borderWidth: 1,
      },
    ];

    if (graphPayload.hasPrevious) {
      datasets.push({
        label: 'Previous run (ms)',
        data: graphPayload.previousDurations,
        backgroundColor: 'rgba(167, 139, 250, 0.55)',
        borderColor: 'rgba(167, 139, 250, 1)',
        borderWidth: 1,
      });
    }

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: graphPayload.labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#e6e9ef' },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw;
                return v == null ? ctx.dataset.label + ': n/a' : ctx.dataset.label + ': ' + v + ' ms';
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#9aa3b2', maxRotation: 45, minRotation: 0, font: { size: 10 } },
            grid: { color: 'rgba(42,47,58,0.6)' },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Duration (ms)', color: '#9aa3b2' },
            ticks: { color: '#9aa3b2' },
            grid: { color: 'rgba(42,47,58,0.6)' },
          },
        },
      },
    });
  })();
</script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// 8. Write output
// ---------------------------------------------------------------------------

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, html, "utf8");

console.log(`API report generated: ${OUTPUT_FILE}`);
console.log(
    `  Campaigns: ${summary.totalCampaigns}  |  Collections: ${summary.totalCollections}  |  Scenarios: ${summary.totalScenarios}  |  Test cases: ${summary.totalTestCases}`
);
console.log(
    `  Passed: ${summary.passed}  Failed: ${summary.failed}  |  Total duration: ${summary.totalDurationMs} ms`
);
console.log(`  Last run JSON: ${LAST_RUN_JSON}`);
if (previousRun) {
    console.log(`  Previous run JSON (for graph): ${PREV_RUN_JSON}`);
} else {
    console.log(`  No previous run yet — graph will populate on the next report generation.`);
}

#!/usr/bin/env node
/**
 * generate-report.mjs
 * ---------------------------------------------------------------------------
 * Reads the raw Serenity BDD JSON result files (target/site/serenity/*.json)
 * and builds a single, self-contained, better-looking HTML report focused on
 * API calls: request/response headers, bodies, status codes, timings and
 * pass/fail results per step - with tokens/secrets masked as "***".
 *
 * USAGE
 *   node generate-report.mjs [serenityJsonDir] [outputHtmlFile]
 *
 *   serenityJsonDir  default: target/site/serenity
 *   outputHtmlFile   default: target/site/custom-report/index.html
 *
 * No npm install required - uses only Node's built-in modules.
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

// ---------------------------------------------------------------------------
// 1. Helpers
// ---------------------------------------------------------------------------

/** Mask tokens / secrets wherever they show up in headers, bodies, cookies. */
function maskSensitive(input) {
    if (input === null || input === undefined) return input;
    let out = String(input);

    // JSON-style fields: "token": "abc123"  ->  "token": "***"
    out = out.replace(
        /("(?:token|access_token|refresh_token|id_token|api[_-]?key|secret|password|client_secret|authorization)"\s*:\s*")([^"]*)(")/gi,
        "$1***$3"
    );

    // Authorization: Bearer xxx / Basic xxx
    out = out.replace(/(Authorization\s*[:=]\s*(?:Bearer|Basic)\s+)\S+/gi, "$1***");

    // Cookie / header pairs like token=xxxxx (query strings, Cookie headers, Set-Cookie)
    out = out.replace(/((?:^|[;\s=])(?:token|access_token|refresh_token|session|sessionid|jwt)\s*=\s*)[^\s;,"&\r\n]+/gi, "$1***");

    // Generic api-key style headers: Name: value  or  Name=value
    out = out.replace(
        /((?:X-Api-Key|Api-Key|X-Auth-Token|X-Access-Token)\s*[:=]\s*)\S+/gi,
        "$1***"
    );

    return out;
}

/** Parse a Serenity header blob ("Name=value\r\n..." or "Name: value\r\n...") into pairs. */
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

/** Java Instant strings look like 2026-08-03T10:27:49.697740300+04:00[Asia/Dubai] - trim to something JS Date can parse. */
function parseJavaInstant(str) {
    if (!str) return null;
    const noZoneId = str.replace(/\[[^\]]+\]$/, ""); // drop [Asia/Dubai]
    const fixedFraction = noZoneId.replace(/\.(\d{3})\d*/, ".$1"); // ns -> ms
    const d = new Date(fixedFraction);
    return isNaN(d.getTime()) ? null : d;
}

function fmtDate(d) {
    if (!d) return "-";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}
function fmtTime(d) {
    if (!d) return "-";
    return d.toLocaleTimeString(undefined, { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
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

/** Recursively flatten Serenity testSteps, collecting the leaf steps that are actual REST calls. */
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
    // Serenity also writes tag/aggregate json files that don't have testSteps - skip those
    .map((f) => path.join(SERENITY_DIR, f));

const scenarios = [];

for (const file of jsonFiles) {
    let data;
    try {
        data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        continue;
    }
    if (!Array.isArray(data.testSteps)) continue; // not a scenario result file

    const apiCalls = flattenApiCalls(data.testSteps).map(({ groupPath, step }) => {
        const rq = step.restQuery;
        const start = parseJavaInstant(step.startTime);
        const durationMs = step.duration ?? 0;
        const end = start ? new Date(start.getTime() + durationMs) : null;

        return {
            group: groupPath.filter(Boolean).join(" \u203a "), // "Create-auth-token"
            method: rq.method,
            url: rq.path,
            statusCode: rq.statusCode,
            result: step.result,
            dateCalled: fmtDate(start),
            timeCalled: fmtTime(start),
            timeResponded: fmtTime(end),
            durationMs,
            requestHeaders: parseHeaderBlob(rq.requestHeaders),
            requestCookies: parseHeaderBlob(rq.requestCookies),
            requestBody: tryPrettyJson(rq.content),
            responseHeaders: parseHeaderBlob(rq.responseHeaders),
            responseCookies: parseHeaderBlob(rq.responseCookies),
            responseBody: tryPrettyJson(rq.responseBody),
        };
    });

    scenarios.push({
        title: data.title || data.name,
        testCaseName: data.testCaseName,
        methodName: data.methodName,
        feature: data.userStory?.storyName || "",
        capability: data.userStory?.pathElements?.[0]?.description || "",
        result: data.result,
        start: parseJavaInstant(data.startTime),
        end: parseJavaInstant(data.endTime),
        durationMs: data.duration,
        apiCalls,
    });
}

// Sort scenarios by start time for a sensible chronological report
scenarios.sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0));

// Assign a unique DOM id to every API call so the sidebar can link/scroll to it
let callCounter = 0;
for (const scenario of scenarios) {
    for (const call of scenario.apiCalls) {
        call.callId = `call-${callCounter++}`;
    }
}

const summary = {
    total: scenarios.length,
    passed: scenarios.filter((s) => s.result === "SUCCESS").length,
    failed: scenarios.filter((s) => s.result === "FAILURE" || s.result === "ERROR").length,
    other: scenarios.filter((s) => !["SUCCESS", "FAILURE", "ERROR"].includes(s.result)).length,
    totalApiCalls: scenarios.reduce((n, s) => n + s.apiCalls.length, 0),
    generatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// 3. Render HTML
// ---------------------------------------------------------------------------

function statusBadgeClass(result) {
    if (result === "SUCCESS") return "badge-pass";
    if (result === "FAILURE" || result === "ERROR") return "badge-fail";
    return "badge-neutral";
}

function methodBadgeClass(method) {
    const m = (method || "").toUpperCase();
    return "method-" + (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m) ? m.toLowerCase() : "other");
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
    // Serenity records the outcome of each step (pass/fail) plus the status
    // code returned. We surface both together as the "assertions" for the call.
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

function renderApiCall(call, idx, callId) {
    return `
  <div class="api-call" id="${callId}">
    <div class="api-call-header">
      <span class="method-badge ${methodBadgeClass(call.method)}">${escapeHtml(call.method)}</span>
      <span class="api-url">${escapeHtml(call.url)}</span>
      <span class="status-code ${statusCodeClass(call.statusCode)}">${call.statusCode ?? "-"}</span>
      <span class="badge ${statusBadgeClass(call.result)}">${escapeHtml(call.result)}</span>
    </div>
    ${call.group ? `<div class="api-group">Step: ${escapeHtml(call.group)}</div>` : ""}

    <div class="timing-row">
      <div class="timing-item"><span class="timing-label">Date called</span><span class="timing-value">${call.dateCalled}</span></div>
      <div class="timing-item"><span class="timing-label">Time called</span><span class="timing-value">${call.timeCalled}</span></div>
      <div class="timing-item"><span class="timing-label">Time responded</span><span class="timing-value">${call.timeResponded}</span></div>
      <div class="timing-item"><span class="timing-label">Duration</span><span class="timing-value">${call.durationMs} ms</span></div>
    </div>

    <details class="dropdown" open>
      <summary>Assertions</summary>
      <div class="dropdown-body">${renderAssertions(call)}</div>
    </details>

    <details class="dropdown">
      <summary>Request Headers <span class="count">${call.requestHeaders.length}</span></summary>
      <div class="dropdown-body">${renderHeaderTable(call.requestHeaders)}</div>
    </details>

    ${call.requestCookies.length ? `
    <details class="dropdown">
      <summary>Request Cookies <span class="count">${call.requestCookies.length}</span></summary>
      <div class="dropdown-body">${renderHeaderTable(call.requestCookies)}</div>
    </details>` : ""}

    <details class="dropdown">
      <summary>Request Body</summary>
      <div class="dropdown-body">${renderBody(call.requestBody)}</div>
    </details>

    <details class="dropdown">
      <summary>Response Headers <span class="count">${call.responseHeaders.length}</span></summary>
      <div class="dropdown-body">${renderHeaderTable(call.responseHeaders)}</div>
    </details>

    ${call.responseCookies.length ? `
    <details class="dropdown">
      <summary>Response Cookies <span class="count">${call.responseCookies.length}</span></summary>
      <div class="dropdown-body">${renderHeaderTable(call.responseCookies)}</div>
    </details>` : ""}

    <details class="dropdown">
      <summary>Response Body</summary>
      <div class="dropdown-body">${renderBody(call.responseBody)}</div>
    </details>
  </div>`;
}

function renderScenario(scenario, idx) {
    return `
  <section class="scenario" id="scenario-${idx}" data-result="${escapeHtml(scenario.result)}">
    <div class="scenario-header">
      <div class="scenario-title-row">
        <span class="badge ${statusBadgeClass(scenario.result)}">${escapeHtml(scenario.result)}</span>
        <h2 class="scenario-title">${escapeHtml(scenario.title)}</h2>
      </div>
      <div class="scenario-meta">
        ${scenario.capability ? `<span class="meta-chip">${escapeHtml(scenario.capability)}</span>` : ""}
        ${scenario.feature ? `<span class="meta-chip">${escapeHtml(scenario.feature)}</span>` : ""}
        <span class="meta-chip">${scenario.apiCalls.length} API call${scenario.apiCalls.length === 1 ? "" : "s"}</span>
        <span class="meta-chip">${fmtDate(scenario.start)} ${fmtTime(scenario.start)}</span>
        <span class="meta-chip">Total duration: ${scenario.durationMs} ms</span>
      </div>
    </div>
    <div class="scenario-body">
      ${scenario.apiCalls.map((c, i) => renderApiCall(c, i, c.callId)).join("")}
    </div>
  </section>`;
}

/** Sidebar nav: one entry per API call, grouped by scenario, linking/scrolling to its card. */
function renderSidebar(scenarios) {
    return `
  <nav class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">API Calls</span>
      <span class="sidebar-count">${scenarios.reduce((n, s) => n + s.apiCalls.length, 0)}</span>
    </div>
    <div class="sidebar-list">
      ${scenarios
        .map(
            (s, sIdx) => `
        <div class="sidebar-group">
          <div class="sidebar-scenario-title" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</div>
          ${s.apiCalls
                .map(
                    (c) => `
            <a class="sidebar-item" href="#${c.callId}" data-target="${c.callId}">
              <span class="sidebar-method ${methodBadgeClass(c.method)}">${escapeHtml(c.method)}</span>
              <span class="sidebar-url">${escapeHtml(c.url.replace(/^https?:\/\//, ""))}</span>
              <span class="sidebar-code ${statusCodeClass(c.statusCode)}">${c.statusCode ?? "-"}</span>
            </a>`
                )
                .join("")}
        </div>`
        )
        .join("")}
    </div>
  </nav>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>API Test Report</title>
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
    min-width: 110px;
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
    width: 280px;
    height: 100vh;
    overflow-y: auto;
    border-right: 1px solid var(--border);
    background: var(--panel);
    padding-bottom: 24px;
    z-index: 20;
  }

  .content-area { margin-left: 280px; }

  main { padding: 24px 32px; max-width: 1100px; }
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
  .sidebar-group { margin-bottom: 10px; }
  .sidebar-scenario-title {
    font-size: 11px;
    color: var(--text-dim);
    padding: 8px 8px 4px;
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
    padding: 7px 8px;
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

  @media (max-width: 900px) {
    .sidebar { display: none; }
    .content-area { margin-left: 0; }
  }

  .scenario {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 20px;
    overflow: hidden;
  }
  .scenario-header { padding: 16px 20px; border-bottom: 1px solid var(--border); }
  .scenario-title-row { display: flex; align-items: center; gap: 10px; }
  .scenario-title { font-size: 16px; margin: 0; }
  .scenario-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .meta-chip {
    font-size: 11px;
    color: var(--text-dim);
    background: var(--panel-2);
    border: 1px solid var(--border);
    padding: 3px 9px;
    border-radius: 999px;
  }
  .scenario-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }

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

  .api-call {
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
    margin: 12px 0;
  }
  .timing-item {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .timing-label { display: block; font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
  .timing-value { display: block; font-size: 13px; font-family: monospace; margin-top: 2px; }

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

  footer { text-align: center; color: var(--text-dim); font-size: 11px; padding: 30px 0 10px; }
</style>
</head>
<body>
  ${renderSidebar(scenarios)}

  <div class="content-area">
    <header class="top">
      <h1>API Test Report</h1>
      <div class="subtitle">Generated ${summary.generatedAt.toLocaleString()}</div>
      <div class="summary-bar">
        <div class="summary-card"><div class="num">${summary.total}</div><div class="label">Scenarios</div></div>
        <div class="summary-card pass"><div class="num">${summary.passed}</div><div class="label">Passed</div></div>
        <div class="summary-card fail"><div class="num">${summary.failed}</div><div class="label">Failed</div></div>
        <div class="summary-card"><div class="num">${summary.totalApiCalls}</div><div class="label">API Calls</div></div>
      </div>
      <div class="controls">
        <input type="text" id="searchBox" placeholder="Search scenario title, URL, method..." />
        <button data-filter="all" class="active">All</button>
        <button data-filter="SUCCESS">Passed only</button>
        <button data-filter="FAILURE">Failed only</button>
        <button id="expandAll">Expand all</button>
        <button id="collapseAll">Collapse all</button>
      </div>
    </header>

    <main id="scenarioContainer">
      ${scenarios.map((s, i) => renderScenario(s, i)).join("")}
      <footer>Tokens and secrets are automatically masked as *** in this report.</footer>
    </main>
  </div>

<script>
  const searchBox = document.getElementById('searchBox');
  const scenarios = Array.from(document.querySelectorAll('.scenario'));
  const filterButtons = Array.from(document.querySelectorAll('.controls button[data-filter]'));
  let activeFilter = 'all';

  function applyFilters() {
    const term = searchBox.value.trim().toLowerCase();
    scenarios.forEach(sc => {
      const matchesFilter = activeFilter === 'all' || sc.dataset.result === activeFilter;
      const matchesSearch = !term || sc.textContent.toLowerCase().includes(term);
      sc.style.display = (matchesFilter && matchesSearch) ? '' : 'none';
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

  // Sidebar: click an API call -> reset filters so it's guaranteed visible, scroll to it, highlight it
  const sidebarItems = Array.from(document.querySelectorAll('.sidebar-item'));
  sidebarItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.dataset.target;
      const target = document.getElementById(targetId);
      if (!target) return;

      // make sure it's not hidden behind an active filter/search term
      searchBox.value = '';
      activeFilter = 'all';
      filterButtons.forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
      applyFilters();

      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.remove('highlight');
      void target.offsetWidth; // restart animation
      target.classList.add('highlight');

      sidebarItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      history.replaceState(null, '', '#' + targetId);
    });
  });

  // Highlight the sidebar entry for whichever call is currently in view while scrolling
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
</script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// 4. Write output
// ---------------------------------------------------------------------------

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, html, "utf8");

console.log(`API report generated: ${OUTPUT_FILE}`);
console.log(
    `  Scenarios: ${summary.total} (passed: ${summary.passed}, failed: ${summary.failed})  |  API calls: ${summary.totalApiCalls}`
);

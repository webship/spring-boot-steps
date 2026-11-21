'use strict';

// Shared helpers for the step files of this pack.
//
// Not a step file: it registers no step definitions and no hooks. It holds the plumbing the steps use and that
// a project can require for its own steps: the wait budget and the settle on the page's own requests, the users
// registry and the session cache, the login form, fields found by their label and the errors a form prints for
// them, the messages of a page, the status of the page on screen, the default error page, and a request of a
// program (a JSON client with the browser's session).
//
// What Spring Boot and Spring Security draw is the same in every app: the generated login page (a form posting
// to /login with the fields `username` and `password`, the checkbox `remember-me`, the hidden `_csrf` field, an
// alert for `?error` and `?logout`), the generated logout page (`form.logout-form`), the default error page
// ("Whitelabel Error Page"), the JSON error of a program's request (`timestamp`, `status`, `error`, `path`) and
// the health endpoint. An app's own pages (its login page, its error page, its forms) are found the way a person
// finds them: by labels, roles and words, with those names and classes as the fallback.
//
// The pages are rendered on the server: an action is a form post and a full page load. A step that acts waits
// for the page it leads to (the navigation, then the page loaded and quiet), an assertion waits on the page (the
// assertion is the wait), and no step sleeps.
//
// Everything builds on webship-js's own helpers (`gotoUrl`, `friendly`) so the steps fail the way the core
// webship-js steps do.

const { gotoUrl, friendly } = require('webship-js/tests/step-definitions/webship');

/** The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 10 seconds. */
function budget(world) {
  return Math.max((world && world.minWaitTime && world.minWaitTime.page) || 0, 10000);
}

/** The settle budget after an action (`minWaitTime.page`, 3 seconds by default). */
function settleBudget(world) {
  return (world && world.minWaitTime && world.minWaitTime.page) || 3000;
}

/** Escape a literal string for use in a RegExp. */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** White space collapsed and trimmed. */
function clean(text) {
  return String(text === null || text === undefined ? '' : text).replace(/\s+/g, ' ').trim();
}

/** A list for an error message: `"a", "b", "c"` or `(none)`. */
function listed(values) {
  const items = [...new Set((values || []).map(clean).filter(Boolean))];
  return items.length ? items.map((item) => `"${item}"`).join(', ') : '(none)';
}

/** The site root without a trailing slash. */
function siteRoot(world) {
  return String(world.launchUrl || (world.parameters && world.parameters.launchUrl) || '').replace(/\/+$/, '');
}

/** Join the site root and a path with exactly one slash. Absolute URLs pass through. */
function siteUrl(world, url) {
  if (!url) return siteRoot(world) + '/';
  if (/^https?:\/\//i.test(url)) return url;
  return siteRoot(world) + '/' + String(url).replace(/^\/+/, '');
}

/** A setting of cucumber.js (`worldParameters.<key>`), or its default. */
function setting(world, key, fallback) {
  const value = world.parameters && world.parameters[key];
  return value === undefined || value === null || value === '' ? fallback : value;
}

/** A path of the app read from cucumber.js (`worldParameters.<key>`), or its default. */
function appPath(world, key, fallback) {
  return '/' + String(setting(world, key, fallback)).replace(/^\/+/, '');
}

/** The login page (`loginPath`, /login: the page Spring Security generates, or the app's own). */
const loginPath = (world) => appPath(world, 'loginPath', '/login');
/** The logout page (`logoutPath`, /logout: the generated confirmation page; a POST to it logs out). */
const logoutPath = (world) => appPath(world, 'logoutPath', '/logout');
/** A page only a signed-in account may open (`protectedPath`, /owners/find on the test site). */
const protectedPath = (world) => appPath(world, 'protectedPath', '/owners/find');
/** The health endpoint (`healthPath`, /actuator/health). */
const healthPath = (world) => appPath(world, 'healthPath', '/actuator/health');
/** The info endpoint (`infoPath`, /actuator/info). */
const infoPath = (world) => appPath(world, 'infoPath', '/actuator/info');
/** The name of the session cookie (`sessionCookie`, JSESSIONID). */
const sessionCookieName = (world) => setting(world, 'sessionCookie', 'JSESSIONID');
/** The name of the remember-me cookie (`rememberMeCookie`, remember-me). */
const rememberMeCookieName = (world) => setting(world, 'rememberMeCookie', 'remember-me');
/** The name of the field that carries the CSRF token in a form (`csrfParameter`, _csrf). */
const csrfParameter = (world) => setting(world, 'csrfParameter', '_csrf');

/** The path of the page the browser shows, without the query and the fragment. */
function currentPath(world) {
  try {
    return new URL(world.page.url()).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
}

/** Whether the browser shows the page of a path (trailing slashes ignored). */
function isOnPath(world, path) {
  return currentPath(world) === (String(path).replace(/\/+$/, '') || '/');
}

/** Whether the browser shows a page of the site of cucumber.js (its origin). */
function isOnSite(world) {
  try {
    return new URL(world.page.url()).origin === new URL(siteRoot(world)).origin;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Waiting on the page's own requests
// ---------------------------------------------------------------------------

const TRACKED = new WeakMap();

/** The background requests (XHR and fetch) of the page that are still running. Attached once per page. */
function requests(world) {
  const page = world.page;
  let state = TRACKED.get(page);
  if (!state) {
    state = { pending: new Set() };
    TRACKED.set(page, state);
    const background = (request) => ['xhr', 'fetch'].includes(request.resourceType());
    page.on('request', (request) => { if (background(request)) state.pending.add(request); });
    const done = (request) => { state.pending.delete(request); };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
    // A navigation drops the requests of the page it leaves.
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) state.pending.clear(); });
  }
  return state;
}

/**
 * Wait for the page to go quiet after an action: the document is loaded and no background request has been
 * running for a moment. Returns as soon as that is true, at the latest after `timeout` (the settle budget).
 */
async function settle(world, timeout) {
  const state = requests(world);
  const deadline = Date.now() + (timeout || settleBudget(world));
  await world.page.waitForLoadState('domcontentloaded', { timeout: Math.max(deadline - Date.now(), 1) }).catch(() => {});
  let quietSince = 0;
  while (Date.now() < deadline) {
    if (state.pending.size === 0) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= 300) return;
    } else {
      quietSince = 0;
    }
    await world.page.waitForTimeout(40);
  }
}

// A request the browser lost because the network of the machine changed (a container starting or stopping on a
// shared machine): no fault of the scenario or of the app.
const NETWORK_ERRORS = /ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|ERR_EMPTY_RESPONSE/;
const CUT_HINT = 'The request was cut before the app answered, because the network of the machine changed (a container starting or stopping); nothing is wrong with the scenario. Run it again. On a shared machine, run the suite in the project\'s container (cmd-tools-testing.sh <project> --run in the Webship Workspace), where the network of the host does not reach.';

/** Whether an error is a request the browser lost to a change of the machine's network. */
function isCut(err) {
  return NETWORK_ERRORS.test(String((err && err.message) || err || ''));
}

/** Open a URL and wait for the page to settle. */
async function open(world, url) {
  requests(world);
  try {
    await gotoUrl(world.page, url);
  } catch (err) {
    if (isCut(err)) throw friendly({ message: `Opening ${url} was cut before the app answered.`, cause: err, hint: CUT_HINT });
    throw err;
  }
  await world.page.waitForSelector('body', { state: 'attached', timeout: budget(world) });
  await world.page.waitForLoadState('load', { timeout: budget(world) }).catch(() => {});
  await settle(world);
}

/**
 * Run an action that sends the browser to another page (a link, a form), and wait for that page: the navigation
 * it starts, then the page loaded and quiet. Fails with a friendly error when no page comes within the budget.
 */
async function navigating(world, action, { label, hint } = {}) {
  const page = world.page;
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: budget(world) }),
      action(),
    ]);
  } catch (err) {
    if (isCut(err)) throw friendly({ message: `${label || 'The action'} was cut before the app answered (${page.url()}).`, cause: err, hint: CUT_HINT });
    throw friendly({ message: `${label || 'The action'} did not lead to another page (${page.url()}).`, cause: err, hint });
  }
  await page.waitForLoadState('load', { timeout: budget(world) }).catch(() => {});
  await settle(world);
}

/**
 * Wait until a locator has (or, with `notCase`, no longer has) a visible match and fail with a friendly error
 * otherwise: the wait and the assertion are one call.
 */
async function assertPresence(locator, notCase, { label, hint, timeout, found }) {
  try {
    await locator.first().waitFor({ state: notCase ? 'hidden' : 'visible', timeout });
  } catch {
    const seen = found ? await found().catch(() => '') : '';
    throw friendly({
      message: (notCase ? `Expected not to see ${label}, but it is on the page.` : `Expected to see ${label}, but it did not appear within ${timeout} ms.`) + (seen ? ` ${seen}` : ''),
      hint,
    });
  }
}

/** Poll a reading until it satisfies a check, or fail with the explanation of the last reading. */
async function eventually(world, read, check, explain, timeout) {
  const deadline = Date.now() + (timeout || budget(world));
  let value;
  for (;;) {
    value = await read();
    if (check(value)) return value;
    if (Date.now() > deadline) throw friendly(explain(value));
    await world.page.waitForTimeout(200);
  }
}

// ---------------------------------------------------------------------------
// Accounts and sessions
// ---------------------------------------------------------------------------

/**
 * An account of the users registry in cucumber.js (`worldParameters.users`), by the handle a scenario names it
 * with: its `username` (what the login form takes), its `password`, and `name`, the name the app shows for it
 * when that is not the username.
 */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The user "${handle}" is not in the users registry. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { username: '${handle}', password: process.env.${String(handle).toUpperCase()}_PASSWORD } }. The account itself is created once by the build of the app, never by a feature.`,
    });
  }
  const login = entry.username || entry.email;
  if (!login || !entry.password) {
    throw friendly({
      message: `The user "${handle}" has no ${login ? 'password' : 'username'} in the users registry.`,
      hint: `Set worldParameters.users.${handle}.username and .password in cucumber.js, from environment variables.`,
    });
  }
  return { handle, login, username: entry.username, email: entry.email, password: entry.password, name: entry.name };
}

// The sessions of the accounts that logged in during this run, by site and login: the cookies of the browser
// after a login through the form (without remember-me). A scenario that logs in as an account that already has
// a session takes it over instead of filling in the login form again. `worldParameters.reuseSessions: false` in
// cucumber.js turns it off.
const SESSIONS = new Map();

function sessionKey(world, login) {
  return `${siteRoot(world)}|${String(login).toLowerCase()}`;
}

function reuseSessions(world) {
  return !(world.parameters && world.parameters.reuseSessions === false);
}

/** Forget the session the browser holds in the cache of this run (a logout, an expiry). */
function forgetSession(world) {
  if (world.__sessionKey) SESSIONS.delete(world.__sessionKey);
  world.__sessionKey = null;
}

/** A cookie of the browser for the site, by name, or null. */
async function cookieNamed(world, name) {
  const cookies = await world.page.context().cookies(siteRoot(world) || undefined).catch(() => []);
  return cookies.find((cookie) => cookie.name === name) || null;
}

// ---------------------------------------------------------------------------
// The login form
// ---------------------------------------------------------------------------

/** The login form: a form of the page that holds a password field. */
function loginForm(world) {
  return world.page.locator('form:has(input[type="password"])').first();
}

/** Whether the browser shows the login page with its form. */
async function onLoginPage(world) {
  if (!isOnPath(world, loginPath(world))) return false;
  return (await loginForm(world).count().catch(() => 0)) > 0;
}

// ---------------------------------------------------------------------------
// The page on screen: its status, the default error page
// ---------------------------------------------------------------------------

/** The HTTP status of the page on screen: the one webship-js recorded for its navigation, else the browser's. */
async function documentStatus(world) {
  const last = world._lastResponse;
  const strip = (url) => String(url || '').split('#')[0];
  if (last && last.page === world.page && strip(last.url) === strip(world.page.url())) return last.status;
  return world.page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0];
    return entry && typeof entry.responseStatus === 'number' && entry.responseStatus ? entry.responseStatus : null;
  }).catch(() => null);
}

/**
 * The framework's default error page as the page shows it, or null when the page is not that one: the heading
 * "Whitelabel Error Page", its line "There was an unexpected error (type=<reason>, status=<code>).", and what it
 * prints beyond that (the message and the trace of a development run).
 */
async function defaultErrorPage(world) {
  return world.page.evaluate(() => {
    const heading = [...document.querySelectorAll('h1')].find((h) => h.textContent.trim() === 'Whitelabel Error Page');
    if (!heading) return null;
    const blocks = [...document.querySelectorAll('body > div')].map((d) => d.textContent.replace(/\s+/g, ' ').trim());
    const line = blocks.find((t) => /There was an unexpected error \(type=.*, status=\d+\)/.test(t)) || '';
    const match = line.match(/\(type=(.*), status=(\d+)\)/);
    const extra = [...document.querySelectorAll('body > div')]
      .filter((d) => d.id !== 'created' && !/There was an unexpected error/.test(d.textContent))
      .map((d) => d.textContent.trim()).filter(Boolean);
    return { reason: match ? match[1] : '', status: match ? Number(match[2]) : null, line, extra };
  }).catch(() => null);
}

/** What the page on screen says about itself: its status, title, main heading and text. */
async function pageSummary(world) {
  const status = await documentStatus(world);
  const title = clean(await world.page.title().catch(() => ''));
  const heading = clean(await world.page.locator('h1, h2').filter({ visible: true }).first().innerText({ timeout: 500 }).catch(() => ''));
  const text = clean(await world.page.locator('body').innerText({ timeout: 1000 }).catch(() => ''));
  return { status, title, heading, text };
}

/** A short description of the page on screen for a failure message. */
async function describePage(world) {
  const summary = await pageSummary(world);
  return `HTTP ${summary.status === null ? '(status unknown)' : summary.status} at ${currentPath(world)}, "${summary.title || summary.heading}"`;
}

// ---------------------------------------------------------------------------
// A program's request: a JSON client with the browser's session
// ---------------------------------------------------------------------------

/**
 * Ask the app for a path the way a program does: `Accept: application/json`, with the browser's cookies (its
 * session), from a page of the site, without following a redirect. Returns the status (0 for a redirect, which
 * a browser keeps opaque), the JSON when the answer is JSON, and the text.
 */
async function programRequest(world, path) {
  if (!isOnSite(world)) await open(world, siteUrl(world, '/'));
  const url = siteUrl(world, path);
  try {
    return await world.page.evaluate(async (target) => {
      const response = await fetch(target, { redirect: 'manual', headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      const text = response.type === 'opaqueredirect' ? '' : await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch { json = null; }
      return { status: response.status, redirected: response.type === 'opaqueredirect', type: response.headers.get('content-type') || '', json, text: text.slice(0, 4000) };
    }, url);
  } catch (err) {
    throw friendly({ message: `The request for ${url} did not get an answer.`, cause: err, hint: 'Check launchUrl in cucumber.js, and that the app is running.' });
  }
}

/** The answer of a program's request for a path, as JSON, or a friendly error. */
async function programJson(world, path, { what, hint } = {}) {
  const answer = await programRequest(world, path);
  if (answer.redirected) {
    throw friendly({ message: `${what || path} sent the request on to another page (a redirect, most often to the login page): it is not open to this session.`, hint: hint || 'Log in first, or open it to anybody in the security rules of the app.' });
  }
  if (!answer.json) {
    throw friendly({ message: `${what || path} answered HTTP ${answer.status} with no JSON (${answer.type || 'no content type'}): "${clean(answer.text).slice(0, 160)}".`, hint: hint || 'Check the path in cucumber.js and that the endpoint is exposed.' });
  }
  return answer;
}

/** A value of a JSON object by a dotted path ("build.version"), or undefined. */
function valueAt(object, dotted) {
  return String(dotted).split('.').reduce((value, key) => (value !== null && typeof value === 'object' && key in value ? value[key] : undefined), object);
}

// ---------------------------------------------------------------------------
// Fields and their errors
// ---------------------------------------------------------------------------

/**
 * The visible form control a person means by `name`: its label exactly as written (a label element, also one
 * only screen readers read, `aria-labelledby` or `aria-label`), then its `name` attribute, then the one label
 * that starts with the text (letter case ignored), then its placeholder.
 */
async function findField(world, name, { timeout } = {}) {
  const page = world.page;
  const deadline = Date.now() + (timeout || budget(world));
  const candidates = () => [
    page.getByLabel(name, { exact: true }),
    page.locator(`[name="${String(name).replace(/["\\]/g, '\\$&')}"]`),
    page.getByLabel(new RegExp('^\\s*' + escapeRegExp(name), 'i')),
    page.getByPlaceholder(name, { exact: true }),
  ];
  for (;;) {
    for (const locator of candidates()) {
      const count = await locator.count().catch(() => 0);
      for (let i = 0; i < count; i += 1) {
        const item = locator.nth(i);
        if (await item.isVisible().catch(() => false)) return item;
      }
    }
    if (Date.now() > deadline) break;
    await page.waitForTimeout(150);
  }
  const labels = await visibleFieldLabels(world);
  throw friendly({
    message: `No field "${name}" is on the page (${world.page.url()}). The fields are: ${listed(labels)}.`,
    hint: 'Name the field by its label as the page writes it, or by its name attribute ("firstName").',
  });
}

/** The labels of the visible form controls of the page, for an error message. */
async function visibleFieldLabels(world) {
  return world.page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      const box = el.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean);
      const text = by.length ? by.map((n) => n.textContent).join(' ') : ((el.labels && el.labels[0] && el.labels[0].textContent) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '');
      out.push(text.replace(/\s+/g, ' ').trim());
    }
    return out;
  }).catch(() => []);
}

// What a server-rendered form prints next to a field it refused: the message of `th:errors` or of the JSP
// `<form:errors>` tag (`<span id="<field>.errors">`), in the classes the common themes give it: `.help-inline`
// and `.help-block` (Bootstrap 2 and 3), `.invalid-feedback` (Bootstrap 4 and 5), `.text-danger`, `.error`,
// `.errors`, `.field-error`, `.form-error`, or an element with role="alert".
const ERROR_LINES = '.help-inline, .help-block, .invalid-feedback, .text-danger, .error, .errors, .field-error, .form-error, .error-message, [id$=".errors"], [role="alert"]';

/**
 * The error messages the page shows for a field: the elements its `aria-describedby` names that are errors, then
 * the error lines inside the smallest container that holds the field and no other field.
 */
async function fieldErrors(field) {
  return field.evaluate((el, selector) => {
    const shown = (n) => {
      if (!n || !n.isConnected) return false;
      const style = getComputedStyle(n);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const box = n.getBoundingClientRect();
      return box.width > 0 || box.height > 0;
    };
    const text = (n) => (n.textContent || '').replace(/\s+/g, ' ').trim();
    const found = [];
    for (const id of (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)) {
      const node = document.getElementById(id);
      if (node && shown(node) && text(node) && node.matches(selector)) found.push(text(node));
    }
    let group = null;
    for (let node = el.parentElement, i = 0; node && i < 6; node = node.parentElement, i += 1) {
      if (node.tagName === 'FORM') break;
      const others = [...node.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((c) => c !== el);
      if (others.length) break;
      group = node;
    }
    if (group) {
      for (const line of group.querySelectorAll(selector)) {
        if (line === el || line.contains(el)) continue;
        if (shown(line) && text(line)) found.push(text(line));
      }
    }
    return [...new Set(found)];
  }, ERROR_LINES).catch(() => []);
}

/** Every refused field of the page with its errors: [{field, errors}] by the field's label (else its name). */
async function refusedFields(world) {
  const page = world.page;
  const fields = page.locator('form input:not([type=hidden]):not([type=submit]):not([type=button]), form select, form textarea');
  const out = [];
  const count = await fields.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const field = fields.nth(i);
    if (!(await field.isVisible().catch(() => false))) continue;
    const errors = await fieldErrors(field);
    if (!errors.length) continue;
    const label = await field.evaluate((el) => {
      const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean);
      const text = by.length ? by.map((n) => n.textContent).join(' ') : ((el.labels && el.labels[0] && el.labels[0].textContent) || el.getAttribute('aria-label') || el.getAttribute('name') || '');
      return text.replace(/\s+/g, ' ').trim();
    });
    out.push({ field: label, errors });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Messages: the flash messages and the alerts of a page
// ---------------------------------------------------------------------------

// The kind of a message by the class the page gives it: Bootstrap's alert-*, and the words other themes use.
const KINDS = [
  ['success', /\b(alert|flash|message|notification|toast)-success\b|\bsuccess\b/],
  ['error', /\b(alert|flash|message|notification|toast)-(danger|error)\b|\b(danger|error)\b/],
  ['warning', /\b(alert|flash|message|notification|toast)-warning\b|\bwarning\b/],
  ['info', /\b(alert|flash|message|notification|toast)-(info|notice|primary|secondary|light|dark)\b|\b(info|notice)\b/],
];

/**
 * The messages the page shows: alerts (`[role=alert]`, `[role=status]`, `.alert`) and flash messages (`.flash`,
 * `.flash-*`, `#…-message`), visible, as `{kind, text}`. A field error is not a message.
 */
async function pageMessages(world) {
  const list = await world.page.evaluate((errorLines) => {
    const out = [];
    const seen = new Set();
    for (const n of document.querySelectorAll('[role="alert"], [role="status"], .alert, .flash, [class*="flash-"], [id$="-message"]')) {
      if (n.closest('form') && n.matches(errorLines) && !n.matches('.alert')) continue;
      if (seen.has(n) || [...seen].some((s) => s.contains(n))) continue;
      const style = getComputedStyle(n);
      const box = n.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || (!box.width && !box.height)) continue;
      const copy = n.cloneNode(true);
      copy.querySelectorAll('button, .btn-close, .close, [data-bs-dismiss], [data-dismiss]').forEach((b) => b.remove());
      const text = (copy.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      seen.add(n);
      out.push({ cls: String(n.className || '') + ' ' + n.id, text });
    }
    return out;
  }, ERROR_LINES).catch(() => []);
  return list.map((item) => {
    const kind = (KINDS.find(([, re]) => re.test(item.cls)) || [''])[0];
    return { kind, text: item.text };
  });
}

module.exports = {
  budget,
  settleBudget,
  escapeRegExp,
  clean,
  listed,
  siteRoot,
  siteUrl,
  setting,
  appPath,
  loginPath,
  logoutPath,
  protectedPath,
  healthPath,
  infoPath,
  sessionCookieName,
  rememberMeCookieName,
  csrfParameter,
  currentPath,
  isOnPath,
  isOnSite,
  requests,
  settle,
  isCut,
  CUT_HINT,
  open,
  navigating,
  assertPresence,
  eventually,
  resolveUser,
  SESSIONS,
  sessionKey,
  reuseSessions,
  forgetSession,
  cookieNamed,
  loginForm,
  onLoginPage,
  documentStatus,
  defaultErrorPage,
  pageSummary,
  describePage,
  programRequest,
  programJson,
  valueAt,
  findField,
  visibleFieldLabels,
  ERROR_LINES,
  fieldErrors,
  refusedFields,
  pageMessages,
};

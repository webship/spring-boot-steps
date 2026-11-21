'use strict';

// The error pages: the page of a status (the app's own error page, or the framework's default one), the default
// error page itself ("Whitelabel Error Page", what an app without an error page of its own shows), the check that a
// live app shows no debug information (no stack trace, no exception), and the JSON error a program gets
// (`timestamp`, `status`, `error`, `path`, and `trace` or `message` only when the app is told to include them).
//
// The status a step reads is the one the browser received for the page on screen (webship-js records it for every
// navigation), so it follows the session and the forms the scenario sent.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  listed,
  currentPath,
  settle,
  onLoginPage,
  documentStatus,
  defaultErrorPage,
  pageSummary,
  describePage,
  programRequest,
} = require('./spring-boot-helpers');

/**
 * Assert that the browser shows the error page of a status: the page answered with that status, and it is an
 * error page, the app's own or the framework's default one (whose line names the status), not the login page a
 * visitor is sent to.
 *
 * Example #1: Then I should see the 404 error page
 * Example #2: Then I should see the 403 error page
 * Example #3: And I should see the 500 error page
 * Example #4: Then we should see the 404 error page
 * Example #5: Then I should not see the 404 error page
 */
Then(/^(I |we )*should( not)* see the (\d{3}) error page$/, async function (pronounCase, notCase, code) {
  const wanted = Number(code);
  const deadline = Date.now() + budget(this);
  let status;
  let shows;
  for (;;) {
    await settle(this);
    status = await documentStatus(this);
    const fallback = await defaultErrorPage(this);
    shows = status === wanted && !(await onLoginPage(this)) && (!fallback || fallback.status === wanted);
    if (notCase ? !shows : shows) return;
    if (notCase || Date.now() > deadline) break;
    await this.page.waitForTimeout(200);
  }
  if (notCase) {
    throw friendly({ message: `Expected not to see the ${code} error page, but the browser shows it (${await describePage(this)}).`, hint: 'The step reads the status the browser received for the page on screen.' });
  }
  const summary = await pageSummary(this);
  throw friendly({
    message: `Expected the ${code} error page, but the browser shows ${await describePage(this)}: "${summary.text.slice(0, 160)}".`,
    hint: (await onLoginPage(this))
      ? 'A visitor is sent to the login page instead of an error page: Spring Security guards every page that is not open to anybody. Log in first.'
      : 'The step reads the status the browser received for the page on screen (the one the last navigation, link or form brought).',
  });
});

/**
 * Assert that the browser shows, or does not show, the framework's default error page: "Whitelabel Error Page",
 * what an app without an error page of its own answers an error with. An app with its own error page
 * (templates/error.html, or error/<status>.html) never shows it.
 *
 * Example #1: Then I should see the default error page
 * Example #2: Then I should not see the default error page
 * Example #3: And we should see the default error page
 * Example #4: But I should not see the default error page
 * Example #5: Then we should not see the default error page
 */
Then(/^(I |we )*should( not)* see the default error page$/, async function (pronounCase, notCase) {
  await settle(this);
  const page = await defaultErrorPage(this);
  if (notCase && page) {
    throw friendly({ message: `The browser shows the framework's default error page at ${currentPath(this)}: "${page.line}".`, hint: 'An app shows its own error page once it has one: templates/error.html, or templates/error/<status>.html for one status.' });
  }
  if (!notCase && !page) {
    throw friendly({ message: `Expected the framework's default error page ("Whitelabel Error Page"), but the browser shows ${await describePage(this)}.`, hint: 'An app with an error page of its own (templates/error.html) shows that one instead; the default page is there only when the app has none (and spring.web.error.whitelabel.enabled is not false).' });
  }
});

/**
 * Assert what the framework's default error page says: the reason and the status of its line "There was an
 * unexpected error (type=Not Found, status=404).".
 *
 * Example #1: Then the default error page should say "Not Found" with the status 404
 * Example #2: Then the default error page should say "Forbidden" with the status 403
 * Example #3: And the default error page should say "Internal Server Error" with the status 500
 * Example #4: Then the default error page should say "Method Not Allowed" with the status 405
 * Example #5: Then the default error page should say "Bad Request" with the status 400
 */
Then(/^the default error page should say "([^"]*)" with the status (\d{3})$/, async function (reason, code) {
  await settle(this);
  const page = await defaultErrorPage(this);
  if (!page) {
    throw friendly({ message: `Expected the framework's default error page, but the browser shows ${await describePage(this)}.`, hint: 'The default error page is there only when the app has no error page of its own.' });
  }
  if (page.reason !== reason || page.status !== Number(code)) {
    throw friendly({ message: `The default error page says "${page.line}", not type=${reason}, status=${code}.`, hint: 'The line names the reason phrase and the status the app answered with.' });
  }
});

/** The signs of debug information the page shows: what a live app must never print. */
async function debugSigns(world) {
  const signs = await world.page.evaluate(() => {
    const out = [];
    const text = (document.body ? document.body.innerText : '').replace(/\r/g, '');
    const frame = text.match(/\bat [\w$.]+\.[\w$<>]+\([\w$]+\.java:\d+\)/);
    if (frame) out.push(`a stack trace ("${frame[0]}")`);
    const exception = text.match(/\b(?:java|jakarta|javax|org\.springframework|org\.hibernate|org\.apache)\.[\w.$]*(?:Exception|Error)\b/);
    if (exception) out.push(`an exception class ("${exception[0]}")`);
    if (/^\s*Caused by:/m.test(text)) out.push('a "Caused by:" line');
    return out;
  }).catch(() => []);
  const fallback = await defaultErrorPage(world);
  if (fallback && fallback.extra.length) signs.push(`what the default error page prints beyond its line ("${clean(fallback.extra.join(' ')).slice(0, 100)}")`);
  return signs;
}

/**
 * Assert that the page shows no debug information: no stack trace, no Java exception class, no "Caused by:"
 * line, and no message or trace on the default error page. A live app answers an error with a plain error page;
 * a development run (DevTools, or spring.web.error.include-stacktrace=always) prints how the app is built.
 *
 * Example #1: Then the page should not show debug information
 * Example #2: And the page should not show debug information
 * Example #3: Then the page should show debug information
 * Example #4: But the page should not show debug information
 * Example #5: Then the page should not show debug information
 */
Then(/^the page should( not)* show debug information$/, async function (notCase) {
  await settle(this);
  const signs = await debugSigns(this);
  if (notCase && signs.length) {
    throw friendly({ message: `The page shows debug information: ${signs.join(', ')} (${currentPath(this)}).`, hint: 'A live app leaves the message and the trace out of its error pages (spring.web.error.include-message and include-stacktrace are never by default; DevTools sets them to always in development).' });
  }
  if (!notCase && !signs.length) {
    throw friendly({ message: `Expected the page to show debug information, but it shows none (${await describePage(this)}).`, hint: 'An app prints a trace only when it is told to (spring.web.error.include-stacktrace=always, or DevTools in development).' });
  }
});

/**
 * Ask the app for a path the way a program does: with `Accept: application/json` and the browser's session,
 * without following a redirect. The answer is read by the next steps: an error comes back as JSON
 * (`timestamp`, `status`, `error`, `path`).
 *
 * Example #1: When a program asks for "/oups"
 * Example #2: When a program asks for "/actuator/env"
 * Example #3: And a program asks for "/no-such-page"
 * Example #4: When a program asks for "/owners/new"
 * Example #5: When a program asks for "/actuator/health"
 */
When(/^a program asks for "([^"]*)"$/, async function (path) {
  this.__programAnswer = { path, ...(await programRequest(this, path)) };
});

/** The answer the last "a program asks for" step got, or a friendly error. */
function programAnswer(world) {
  if (!world.__programAnswer) {
    throw friendly({ message: 'No program asked the app for anything in this scenario.', hint: 'Ask first: When a program asks for "/path".' });
  }
  return world.__programAnswer;
}

/**
 * Assert the error a program got: the status of the answer and its JSON error (`status` and `error`, the reason
 * phrase). A redirect (to the login page) is no error answer.
 *
 * Example #1: Then the program should get the error "Internal Server Error" with the status 500
 * Example #2: Then the program should get the error "Forbidden" with the status 403
 * Example #3: And the program should get the error "Not Found" with the status 404
 * Example #4: Then the program should get the error "Unauthorized" with the status 401
 * Example #5: Then the program should get the error "Method Not Allowed" with the status 405
 */
Then(/^the program should get the error "([^"]*)" with the status (\d{3})$/, async function (reason, code) {
  const answer = programAnswer(this);
  if (answer.redirected) {
    throw friendly({ message: `The program's request for ${answer.path} was sent on to another page (a redirect, most often to the login page), not answered with an error.`, hint: 'A visitor is sent to the login page; log in first to get the access-denied answer.' });
  }
  const json = answer.json || {};
  if (answer.status !== Number(code) || json.status !== Number(code) || json.error !== reason) {
    throw friendly({ message: `The program got HTTP ${answer.status} with ${answer.json ? JSON.stringify({ status: json.status, error: json.error, path: json.path }) : `no JSON: "${clean(answer.text).slice(0, 120)}"`}, not the error "${reason}" with the status ${code}.`, hint: 'The framework answers a program\'s error with JSON: timestamp, status, error (the reason phrase), path.' });
  }
});

/**
 * Assert that the error a program got carries, or does not carry, a stack trace (`trace`) or the message of the
 * exception (`message`). A live app leaves both out; a development run puts them in.
 *
 * Example #1: Then the error answer should not carry a stack trace
 * Example #2: And the error answer should not carry the exception message
 * Example #3: Then the error answer should carry a stack trace
 * Example #4: Then the error answer should carry the exception message
 * Example #5: But the error answer should not carry a stack trace
 */
Then(/^the error answer should( not)* carry (a stack trace|the exception message)$/, async function (notCase, what) {
  const answer = programAnswer(this);
  const key = what === 'a stack trace' ? 'trace' : 'message';
  const value = answer.json && answer.json[key];
  if (notCase && value) {
    throw friendly({ message: `The error answer for ${answer.path} carries ${what}: "${clean(value).slice(0, 140)}".`, hint: `A live app leaves it out: spring.web.error.include-${key === 'trace' ? 'stacktrace' : 'message'} is never by default (DevTools sets it to always in development).` });
  }
  if (!notCase && !value) {
    throw friendly({ message: `The error answer for ${answer.path} carries no ${key} (it carries ${listed(Object.keys(answer.json || {}))}).`, hint: `The app puts it in only when told to: spring.web.error.include-${key === 'trace' ? 'stacktrace' : 'message'}=always.` });
  }
});

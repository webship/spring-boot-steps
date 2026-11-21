'use strict';

// The session: logging in by a handle of the users registry or with a username and a password, the login form
// and its refusals, remember-me, the page asked for before the login, logging out (through the app or the
// generated confirmation page), who is signed in, a browser closed and opened again, a session that ended on the
// server, and the cookies of the session.
//
// The login page is Spring Security's generated one (a form posting to /login with the fields `username` and
// `password`, the checkbox `remember-me`), or the app's own, found the same way: the form of the login page that
// holds a password field, its fields by their labels first. A refused login comes back to the login page with an
// alert (`?error`), a logout lands on it with another (`?logout`).
//
// Accounts are configuration, not test data: they are listed in cucumber.js (`worldParameters.users`) and created
// once by the build of the app. A feature never creates or deletes users.

const { Before, Given, When, Then } = require('@cucumber/cucumber');
const { friendly, onNewPage } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  listed,
  siteUrl,
  loginPath,
  logoutPath,
  protectedPath,
  sessionCookieName,
  rememberMeCookieName,
  isOnPath,
  open,
  navigating,
  settle,
  assertPresence,
  resolveUser,
  SESSIONS,
  sessionKey,
  reuseSessions,
  forgetSession,
  cookieNamed,
  loginForm,
  onLoginPage,
  pageMessages,
  documentStatus,
  describePage,
} = require('./spring-boot-helpers');

const LOGIN_HINT = 'The login page is at worldParameters.loginPath (/login: the page Spring Security generates, or the app\'s own): a username field, a password field and a submit button. Check launchUrl and loginPath in cucumber.js.';

// The page a visitor asked for when the app sent the browser to the login page instead (Spring Security saves it
// and opens it after the login): the last navigation that answered with a redirect to the login page.
const TRACKED_PAGES = new WeakSet();
function trackAskedFor(world) {
  const page = world.page;
  if (!page || TRACKED_PAGES.has(page)) return;
  TRACKED_PAGES.add(page);
  page.on('response', (response) => {
    try {
      const request = response.request();
      const status = response.status();
      if (!request.isNavigationRequest() || response.frame() !== page.mainFrame() || status < 300 || status >= 400) return;
      const from = new URL(response.url());
      const to = new URL(response.headers().location || '', response.url());
      const login = loginPath(world).replace(/\/+$/, '');
      if (to.pathname.replace(/\/+$/, '') === login && from.pathname.replace(/\/+$/, '') !== login && request.method() === 'GET') {
        world.__askedFor = from.pathname;
      }
    } catch { /* a response without a usable address */ }
  });
}
Before(function () {
  this.__askedFor = null;
  this.__sessionKey = null;
  this.__sessionAtLogin = null;
  trackAskedFor(this);
});
onNewPage((world) => trackAskedFor(world));

/** The field of the login form a person types the username in, by its label first. */
async function usernameField(world) {
  const form = loginForm(world);
  for (const label of ['Username', 'User name', 'Email', 'Email address', 'Login']) {
    const byLabel = form.getByLabel(label, { exact: true });
    if (await byLabel.count()) return byLabel.first();
  }
  for (const selector of ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', 'input[type="text"]']) {
    const field = form.locator(selector);
    if (await field.count()) return field.first();
  }
  throw friendly({ message: `The login form has no username field (${world.page.url()}).`, hint: LOGIN_HINT });
}

/** The password field of the login form. */
async function passwordField(world) {
  const form = loginForm(world);
  const byLabel = form.getByLabel('Password', { exact: true });
  if (await byLabel.count()) return byLabel.first();
  return form.locator('input[name="password"], input[type="password"]').first();
}

/** Open the login page (the cookies of the browser stay), and wait for its form. */
async function openLoginForm(world) {
  await open(world, siteUrl(world, loginPath(world)));
  try {
    await loginForm(world).waitFor({ state: 'visible', timeout: budget(world) });
  } catch (err) {
    throw friendly({ message: `The login form did not appear at ${siteUrl(world, loginPath(world))} (${await describePage(world)}).`, cause: err, hint: LOGIN_HINT });
  }
}

/**
 * Tick or untick a checkbox of the login form by its label, by the words written beside it (the generated page's
 * "Remember me on this computer." has no label), or, for words about being remembered, the field `remember-me`.
 */
async function setLoginCheckbox(world, label, checked) {
  const form = loginForm(world);
  let box = form.getByLabel(label, { exact: true });
  if (!(await box.count())) {
    const index = await form.locator('input[type="checkbox"]').evaluateAll((boxes, wanted) => {
      const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return boxes.findIndex((b) => {
        const beside = b.parentElement ? b.parentElement.textContent : '';
        return norm(beside) === norm(wanted) || norm(beside).includes(norm(wanted));
      });
    }, label);
    if (index >= 0) box = form.locator('input[type="checkbox"]').nth(index);
  }
  if (!(await box.count()) && /remember/i.test(label)) box = form.locator('input[name="remember-me"]');
  if (!(await box.count())) {
    const boxes = await form.locator('input[type="checkbox"]').evaluateAll((els) => els.map((el) => (el.labels && el.labels[0] && el.labels[0].textContent) || (el.parentElement && el.parentElement.textContent) || el.name));
    throw friendly({ message: `The login form has no "${label}" checkbox. It has: ${listed(boxes)}.`, hint: 'Name the checkbox as the page writes it ("Remember me on this computer." on the generated login page).' });
  }
  if ((await box.first().isChecked()) !== checked) await box.first().click();
}

/** The alerts of the login page: what it says about the last login or logout. */
async function loginPageMessages(world) {
  return (await pageMessages(world)).map((m) => m.text);
}

/**
 * Fill in and submit the login form, and wait for the page that answers: the login page again (with the reason
 * it gives), or another page (the login worked). The login page on screen is used as it is, so a page asked for
 * before it (saved by the app) opens after the login; otherwise the step opens the login page.
 *
 * @returns {Promise<{error: string}>}
 */
async function submitLogin(world, login, password, { checkbox = null } = {}) {
  if (!(await onLoginPage(world))) await openLoginForm(world);
  const before = await cookieNamed(world, sessionCookieName(world));
  const username = await usernameField(world);
  // For a browser that is signed in already, the generated login page (Spring Security 7) holds the account's
  // username in a read-only field: it asks that account for its password again, and nobody else can log in there.
  if (await username.evaluate((el) => el.readOnly).catch(() => false)) {
    const held = await username.inputValue();
    if (held.toLowerCase() !== String(login).toLowerCase()) {
      throw friendly({ message: `The login page holds the signed-in account "${held}" in a read-only username field, so "${login}" cannot log in there.`, hint: `Log out first (I log out), or start as a visitor (I am not logged in).` });
    }
  } else {
    await username.fill(login);
  }
  await (await passwordField(world)).fill(password);
  if (checkbox) await setLoginCheckbox(world, checkbox.label, checkbox.checked);
  const submit = loginForm(world).locator('button[type="submit"], input[type="submit"], button:not([type])').filter({ visible: true }).first();
  await navigating(world, () => submit.click(), { label: `Logging in as "${login}"`, hint: LOGIN_HINT });
  const after = await cookieNamed(world, sessionCookieName(world));
  world.__sessionAtLogin = { before: before ? before.value : null, after: after ? after.value : null };
  if (!(await onLoginPage(world))) {
    // Still on the login path without its form: the app answered the form itself with an error page (a refused CSRF
    // token, 403, for the form of a session that ended). A login that worked has left the login path, whatever the
    // status of the page it went to (a new app answers its home page with the default 404 page).
    if (isOnPath(world, loginPath(world))) {
      const status = await documentStatus(world);
      return { error: `the login form was answered with HTTP ${status === null ? '(status unknown)' : status} (${await describePage(world)})` };
    }
    return { error: '' };
  }
  const messages = await loginPageMessages(world);
  return { error: messages.join(' ') || 'the login page came back without a message' };
}

/** Take over the session an account opened earlier in this run. */
async function restoreSession(world, user) {
  const key = sessionKey(world, user.login);
  const cookies = SESSIONS.get(key);
  if (!cookies || !reuseSessions(world)) return false;
  const context = world.page.context();
  await context.clearCookies();
  await context.addCookies(cookies);
  await open(world, siteUrl(world, protectedPath(world)));
  if (!(await onLoginPage(world)) && (await signedIn(world))) {
    world.__sessionKey = key;
    return true;
  }
  // The session ended since (a logout, an expiry): log in again.
  SESSIONS.delete(key);
  await context.clearCookies();
  return false;
}

/** Whether the page on screen says a signed-in account is there: no login form, the page of a signed-in account. */
async function signedIn(world) {
  return !(await onLoginPage(world));
}

/** The names the page shows in its header or navigation for the signed-in account. */
async function shownAccountNames(world) {
  return world.page.evaluate(() => {
    const regions = [...document.querySelectorAll('header, nav, [role="banner"], [role="navigation"]')];
    const out = [];
    for (const region of regions) {
      const text = region.textContent.replace(/\s+/g, ' ');
      for (const m of text.matchAll(/\b(?:signed|logged) in as:?\s+([^\s<>]+)/gi)) out.push(m[1]);
      for (const el of region.querySelectorAll('strong, b, [class*="user"], [id*="user"], [class*="account"], [id*="account"]')) {
        const own = el.textContent.replace(/\s+/g, ' ').trim();
        if (own && own.length <= 80 && !el.querySelector('a, button')) out.push(own);
      }
    }
    return [...new Set(out)];
  }).catch(() => []);
}

/**
 * Log in as an account of the users registry (`worldParameters.users` in cucumber.js), by its handle, as a new
 * visitor. An account that logged in earlier in the run takes its session over; otherwise the step logs in
 * through the login form.
 *
 * Example #1: Given I am a logged in user with the "administrator" user
 * Example #2: Given we are a logged in user with the "user" user
 * Example #3: Given I am a logged in user with "administrator"
 * Example #4: And I am a logged in user with the "user" user
 * Example #5: Given we are a logged in user with the "administrator" user
 */
Given(/^(I am |we are )*a logged in user with( the)* "([^"]*)"( user)*$/, { timeout: 120000 }, async function (pronounCase, theCase, handle, userCase) {
  const user = resolveUser(this, handle);
  if (await restoreSession(this, user)) return;
  // A new visitor: no cookie, and a login page of its own (one on screen holds the token of a session now gone).
  await this.page.context().clearCookies();
  await openLoginForm(this);
  const outcome = await submitLogin(this, user.login, user.password);
  if (outcome.error) {
    throw friendly({
      message: `Could not log in as "${handle}" (${user.login}): ${outcome.error}`,
      hint: 'Check the username and the password of the account in worldParameters.users, and that the build of the app created the account.',
    });
  }
  if (reuseSessions(this)) {
    const key = sessionKey(this, user.login);
    SESSIONS.set(key, await this.page.context().cookies());
    this.__sessionKey = key;
  }
});

/**
 * Start as a visitor: the browser holds no cookie of the site, so no session and no remember-me token.
 *
 * Example #1: Given I am not logged in
 * Example #2: Given we are not logged in
 * Example #3: And I am not logged in
 * Example #4: Given I am not logged in
 * Example #5: And we are not logged in
 */
Given(/^(I am |we are )*not logged in$/, async function (pronounCase) {
  await this.page.context().clearCookies();
  this.__sessionKey = null;
  await open(this, siteUrl(this, '/'));
});

/**
 * Open the login page (`worldParameters.loginPath`) and wait for its form. The cookies of the browser stay: a
 * visitor sees the login form, and so does an account that is signed in.
 *
 * Example #1: Given I am on the login page
 * Example #2: Given we are on the login page
 * Example #3: And I am on the login page
 * Example #4: Given I am on the login page
 * Example #5: And we are on the login page
 */
Given(/^(I am |we are )*on the login page$/, async function (pronounCase) {
  await openLoginForm(this);
});

/**
 * Go to the login page (`worldParameters.loginPath`) and wait for its form.
 *
 * Example #1: When I go to the login page
 * Example #2: When we go to the login page
 * Example #3: And I go to the login page
 * Example #4: When I go to the login page
 * Example #5: Then I go to the login page
 */
When(/^(I |we )*go to the login page$/, async function (pronounCase) {
  await openLoginForm(this);
});

/**
 * Log in through the login form as an account of the users registry, as a person does: the login page on screen
 * (so the page asked for before it opens after the login), or the login page opened for it. A checkbox of the
 * form can be ticked or unticked on the way; the generated page's "Remember me on this computer." has no label
 * and is found by its words. The step fails when the app refuses the login.
 *
 * Example #1: When I log in as "administrator" with the login form
 * Example #2: When we log in as "user" with the login form
 * Example #3: When I log in as "user" with the login form and "Remember me on this computer." checked
 * Example #4: And I log in as "administrator" with the login form and "Remember me on this computer." unchecked
 * Example #5: When we log in as "administrator" with the login form
 */
When(/^(I |we )*log in as "([^"]*)" with the login form(?: and "([^"]*)" (checked|unchecked))?$/, { timeout: 120000 }, async function (pronounCase, handle, checkbox, state) {
  const user = resolveUser(this, handle);
  const outcome = await submitLogin(this, user.login, user.password, { checkbox: checkbox ? { label: checkbox, checked: state === 'checked' } : null });
  if (outcome.error) {
    throw friendly({
      message: `The login form refused "${handle}" (${user.login}): ${outcome.error}`,
      hint: 'Check the username and the password of the account in worldParameters.users, and that the build of the app created the account.',
    });
  }
  // The login gave the account another session id: the session kept for it in this run may no longer exist.
  SESSIONS.delete(sessionKey(this, user.login));
  this.__sessionKey = null;
});

/**
 * Submit the login form with a username and a password. The step does not expect the login to succeed: assert
 * the outcome with the next step (the refusal of the login page, the page it sends to).
 *
 * Example #1: When I log in with the username "user" and the password "Wrong-password-1"
 * Example #2: When we log in with the username "nobody" and the password "Whatever-123"
 * Example #3: And I log in with the username "administrator" and the password "not-the-password"
 * Example #4: When I log in with the username "no-such-account" and the password "Wrong-password-1"
 * Example #5: When we log in with the username "user" and the password ""
 */
When(/^(I |we )*log in with the username "([^"]*)" and the password "([^"]*)"$/, async function (pronounCase, login, password) {
  await submitLogin(this, login, password);
});

/**
 * Assert that the login was refused: the browser is back on the login page, which says why. The generated page
 * says "Invalid credentials" (Spring Security 7; 6 said "Bad credentials") for a wrong password and an unknown
 * account alike.
 *
 * Example #1: Then the login should be refused with "Invalid credentials"
 * Example #2: And the login should be refused with "Invalid credentials"
 * Example #3: Then the login should be refused with "Bad credentials"
 * Example #4: Then the login should be refused with "User account is locked"
 * Example #5: Then the login should be refused with "Invalid credentials"
 */
Then(/^the login should be refused with "([^"]*)"$/, async function (message) {
  await settle(this);
  if (!(await onLoginPage(this))) {
    throw friendly({ message: `Expected the login to be refused, but the browser left the login page: ${await describePage(this)}.`, hint: 'A refused login comes back to the login page (?error); this one was let in.' });
  }
  const messages = await loginPageMessages(this);
  if (!messages.some((m) => clean(m) === clean(message))) {
    throw friendly({ message: `The login page does not say "${message}". It says: ${listed(messages)}.`, hint: 'Name the message as the login page writes it ("Invalid credentials" on the generated page).' });
  }
});

/**
 * Assert that the browser shows the login page with its form: a page that needs a session sent a visitor there,
 * a logout ended there, a refused login came back.
 *
 * Example #1: Then I should be on the login page
 * Example #2: Then we should be on the login page
 * Example #3: And I should be on the login page
 * Example #4: Then I should be on the login page
 * Example #5: And we should be on the login page
 */
Then(/^(I |we )*should be on the login page$/, async function (pronounCase) {
  await settle(this);
  if (!(await onLoginPage(this))) {
    throw friendly({ message: `Expected the login page (${loginPath(this)}), but the browser shows ${await describePage(this)}.`, hint: 'A page that needs a session sends a visitor to the login page: check worldParameters.loginPath, and that the session really ended.' });
  }
});

/**
 * Assert that the page shows, or does not show, a login form (a password field and a submit button).
 *
 * Example #1: Then I should see the login form
 * Example #2: Then I should not see the login form
 * Example #3: And we should see the login form
 * Example #4: Then we should not see the login form
 * Example #5: But I should see the login form
 */
Then(/^(I |we )*should( not)* see the login form$/, async function (pronounCase, notCase) {
  await settle(this);
  await assertPresence(this.page.locator('form:has(input[type="password"]):has(button[type="submit"], input[type="submit"], button:not([type]))'), notCase, {
    label: 'the login form',
    hint: LOGIN_HINT,
    timeout: budget(this),
    found: async () => `The browser shows ${await describePage(this)}.`,
  });
});

/** The logout control of the page: a form that posts to the logout path, else a link to it. */
async function logoutControl(world) {
  const path = logoutPath(world);
  const forms = world.page.locator(`form[action$="${path}"]:visible, form[action*="${path}?"]:visible`);
  if (await forms.count()) {
    const button = forms.first().locator('button, input[type="submit"]').first();
    if (await button.count()) return { kind: 'form', control: button };
  }
  const links = world.page.locator(`a[href$="${path}"]:visible`);
  if (await links.count()) return { kind: 'link', control: links.first() };
  return null;
}

/**
 * The confirmation page of the logout, on screen: the generated one (`form.logout-form`), or the logout page of the
 * app with a form that posts to it. A "Log out" button of another page is no confirmation page.
 */
async function logoutConfirmation(world) {
  const generated = world.page.locator('form.logout-form').filter({ visible: true });
  if (await generated.count()) return generated.first();
  if (!isOnPath(world, logoutPath(world))) return null;
  const own = world.page.locator(`form[action$="${logoutPath(world)}"]`).filter({ visible: true });
  return (await own.count()) ? own.first() : null;
}

/**
 * Log out as a person does: the logout button of the page (a form posting to the logout path), else its logout
 * link, else the logout page (`worldParameters.logoutPath`, the confirmation page Spring Security generates),
 * whose button confirms it. The session ends on the server; the remember-me token goes with it.
 *
 * Example #1: When I log out
 * Example #2: When we log out
 * Example #3: And I log out
 * Example #4: Then I log out
 * Example #5: Given I log out
 */
When(/^(I |we )*log out$/, async function (pronounCase) {
  forgetSession(this);
  let found = await logoutControl(this);
  if (!found) {
    await open(this, siteUrl(this, logoutPath(this)));
    const form = await logoutConfirmation(this);
    if (!form) {
      throw friendly({ message: `There is nothing to log out with: no logout button or link on the page, and ${logoutPath(this)} shows ${await describePage(this)}.`, hint: 'Set worldParameters.logoutPath to the logout page of the app (/logout by default).' });
    }
    found = { kind: 'confirm', control: form.locator('button, input[type="submit"]').first() };
  }
  await navigating(this, () => found.control.click(), { label: 'Logging out', hint: 'A logout posts to the logout path and lands on the login page (?logout) or the page the app chose.' });
  if (await logoutConfirmation(this)) {
    await navigating(this, () => this.page.locator('form.logout-form button, form.logout-form input[type="submit"]').first().click(), { label: 'Confirming the logout' });
  }
});

/**
 * Go to the logout page (`worldParameters.logoutPath`, /logout). Spring Security answers a GET with a page that
 * asks to confirm the logout; nothing ends until its button is pressed.
 *
 * Example #1: When I go to the logout page
 * Example #2: When we go to the logout page
 * Example #3: And I go to the logout page
 * Example #4: When I go to the logout page
 * Example #5: Given I go to the logout page
 */
When(/^(I |we )*go to the logout page$/, async function (pronounCase) {
  await open(this, siteUrl(this, logoutPath(this)));
});

/**
 * Assert that the browser shows the page that asks to confirm the logout ("Are you sure you want to log out?" on
 * the generated page): a form that posts to the logout path.
 *
 * Example #1: Then I should be asked to confirm the logout
 * Example #2: Then we should be asked to confirm the logout
 * Example #3: And I should be asked to confirm the logout
 * Example #4: Then I should be asked to confirm the logout
 * Example #5: And we should be asked to confirm the logout
 */
Then(/^(I |we )*should be asked to confirm the logout$/, async function (pronounCase) {
  await settle(this);
  if (!(await logoutConfirmation(this))) {
    throw friendly({ message: `Expected the page that asks to confirm the logout, but the browser shows ${await describePage(this)}.`, hint: `Open it with "I go to the logout page" (${logoutPath(this)}): a GET shows it, a POST logs out.` });
  }
});

/**
 * Press the button of the logout confirmation page ("Log Out" on the generated page), and wait for the page the
 * logout leads to.
 *
 * Example #1: When I confirm the logout
 * Example #2: When we confirm the logout
 * Example #3: And I confirm the logout
 * Example #4: When I confirm the logout
 * Example #5: Then I confirm the logout
 */
When(/^(I |we )*confirm the logout$/, async function (pronounCase) {
  const form = await logoutConfirmation(this);
  if (!form) {
    throw friendly({ message: `There is no logout to confirm on this page (${await describePage(this)}).`, hint: 'Go to the logout page first (I go to the logout page).' });
  }
  forgetSession(this);
  await navigating(this, () => form.locator('button, input[type="submit"]').first().click(), { label: 'Confirming the logout' });
});

/**
 * Assert that somebody is, or nobody is, logged in. The step opens a page only a signed-in account may open
 * (`worldParameters.protectedPath`): a visitor is sent to the login page instead.
 *
 * Example #1: Then I should be logged in
 * Example #2: Then I should not be logged in
 * Example #3: Then we should be logged in
 * Example #4: And we should not be logged in
 * Example #5: But I should not be logged in
 */
Then(/^(I |we )*should( not)* be logged in$/, async function (pronounCase, notCase) {
  await open(this, siteUrl(this, protectedPath(this)));
  const signed = !(await onLoginPage(this));
  if (notCase && signed) {
    throw friendly({ message: `Expected nobody to be logged in, but ${protectedPath(this)} opened without the login page (${await describePage(this)}).`, hint: 'Log out first (I log out), or start as a visitor (I am not logged in). A remember-me token also signs the browser in again.' });
  }
  if (!notCase && !signed) {
    throw friendly({ message: `Expected to be logged in, but ${protectedPath(this)} sent the browser to the login page.`, hint: 'Log in first (I am a logged in user with the "..." user). Check worldParameters.protectedPath: a page only a signed-in account may open.' });
  }
});

/**
 * Assert who is logged in, by a handle of the users registry: the step opens a page only a signed-in account may
 * open (`worldParameters.protectedPath`), whose header or navigation names the account ("Signed in as user" on the
 * test site; its `name` in the registry, else its username).
 *
 * Example #1: Then I should be logged in as "administrator"
 * Example #2: Then we should be logged in as "user"
 * Example #3: And I should be logged in as "user"
 * Example #4: Then I should be logged in as "administrator"
 * Example #5: And we should be logged in as "administrator"
 */
Then(/^(I |we )*should be logged in as "([^"]*)"$/, async function (pronounCase, handle) {
  const user = resolveUser(this, handle);
  const wanted = [user.name, user.username, user.email].filter(Boolean).map((n) => n.toLowerCase());
  // Always a page asked for now: a page drawn before a logout or an expiry still shows the name it had.
  await open(this, siteUrl(this, protectedPath(this)));
  if (await onLoginPage(this)) {
    throw friendly({ message: `Expected "${handle}" (${user.login}) to be logged in, but nobody is: ${protectedPath(this)} sent the browser to the login page.`, hint: 'Log in first (I am a logged in user with the "..." user).' });
  }
  const names = await shownAccountNames(this);
  if (!names.some((n) => wanted.includes(n.toLowerCase()))) {
    throw friendly({
      message: `Expected "${handle}" (${user.name || user.login}) to be logged in, but the header and the navigation name ${listed(names)}.`,
      hint: 'The step reads the name the app shows for the signed-in account in its header or navigation ("Signed in as <name>"). Set worldParameters.users.<handle>.name to the name the app shows.',
    });
  }
});

/**
 * Close the browser and open it again: the browser keeps only what outlives it, its persistent cookies (a
 * remember-me token) and its local storage, and forgets its session cookies. Open a page afterwards to see what
 * the app makes of it.
 *
 * Example #1: When I close the browser and open it again
 * Example #2: When we close the browser and open it again
 * Example #3: And I close the browser and open it again
 * Example #4: When I close the browser and open it again
 * Example #5: Given I close the browser and open it again
 */
When(/^(I |we )*close the browser and open it again$/, async function (pronounCase) {
  const state = await this.page.context().storageState();
  state.cookies = state.cookies.filter((cookie) => cookie.expires > 0);
  this.__sessionKey = null;
  await this.replaceContext({ storageState: state });
  trackAskedFor(this);
});

/**
 * Let the session end on the server, as it does after its time out (`server.servlet.session.timeout`, 30 minutes
 * by default): the browser keeps its session cookie, but the app no longer knows its id, which is what the app
 * sees from a browser whose session timed out. Open a page afterwards to see what the app makes of it.
 *
 * Example #1: When my session expires
 * Example #2: When our session expires
 * Example #3: And my session expires
 * Example #4: When my session expires
 * Example #5: Given my session expires
 */
When(/^(?:my|our) session expires$/, async function () {
  const name = sessionCookieName(this);
  const cookie = await cookieNamed(this, name);
  if (!cookie) {
    throw friendly({ message: `The browser holds no session cookie ("${name}"), so there is no session to expire.`, hint: 'Log in first, or set worldParameters.sessionCookie to the name of the app\'s session cookie (JSESSIONID by default).' });
  }
  forgetSession(this);
  const unknown = [...Array(32)].map(() => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
  await this.page.context().addCookies([{ ...cookie, value: unknown }]);
});

/**
 * Assert that the page a visitor asked for opens after the login: the app sent the browser to the login page
 * instead of it, and the login brought the browser back to it (Spring Security marks it with `?continue`).
 *
 * Example #1: Then I should be back on the page I asked for
 * Example #2: Then we should be back on the page we asked for
 * Example #3: And I should be back on the page I asked for
 * Example #4: Then I should be back on the page I asked for
 * Example #5: And we should be back on the page we asked for
 */
Then(/^(I |we )*should be back on the page (?:I|we) asked for$/, async function (pronounCase) {
  const asked = this.__askedFor;
  if (!asked) {
    throw friendly({ message: 'No page sent the browser to the login page in this scenario, so no page was asked for.', hint: 'Open a page that needs a session as a visitor first (I go to "/owners/find"), then log in.' });
  }
  await settle(this);
  if (!isOnPath(this, asked)) {
    throw friendly({ message: `Expected the page asked for before the login (${asked}), but the browser shows ${await describePage(this)}.`, hint: 'The app saves the page a visitor asked for and opens it after the login; a login started on the login page itself goes to the app\'s default page instead.' });
  }
});

/**
 * Assert that the login gave the browser a new session id (the protection against session fixation): the
 * session cookie the browser held before the login form was sent is not the one it holds after it.
 *
 * Example #1: Then the login should have started a new session
 * Example #2: And the login should have started a new session
 * Example #3: Then the login should have started a new session
 * Example #4: But the login should have started a new session
 * Example #5: Then the login should have started a new session
 */
Then(/^the login should have started a new session$/, async function () {
  const seen = this.__sessionAtLogin;
  if (!seen) {
    throw friendly({ message: 'No login form was sent in this scenario.', hint: 'Log in with the login form first (I log in as "..." with the login form).' });
  }
  if (!seen.after) {
    throw friendly({ message: `After the login the browser holds no session cookie ("${sessionCookieName(this)}").`, hint: 'Set worldParameters.sessionCookie to the name of the app\'s session cookie.' });
  }
  if (seen.before && seen.before === seen.after) {
    throw friendly({ message: 'The session id is the same before and after the login: the app kept the session of the visitor.', hint: 'Spring Security changes the session id at the login (sessionManagement().sessionFixation(), changeSessionId by default); an app that turned it off can be taken over by a planted session id.' });
  }
});

/**
 * Assert a flag of the session cookie (`worldParameters.sessionCookie`, JSESSIONID) or of the remember-me cookie
 * (`worldParameters.rememberMeCookie`, remember-me), as the app set it: HttpOnly (out of reach of the page's
 * scripts) or Secure (sent over HTTPS only).
 *
 * Example #1: Then the session cookie should be HttpOnly
 * Example #2: And the session cookie should be Secure
 * Example #3: Then the remember-me cookie should be HttpOnly
 * Example #4: And the remember-me cookie should be Secure
 * Example #5: Then the session cookie should not be Secure
 */
Then(/^the (session|remember-me) cookie should( not)* be (HttpOnly|Secure)$/, async function (which, notCase, flag) {
  const name = which === 'session' ? sessionCookieName(this) : rememberMeCookieName(this);
  const cookie = await cookieNamed(this, name);
  if (!cookie) {
    throw friendly({ message: `The browser holds no ${which} cookie ("${name}").`, hint: which === 'session' ? 'Open a page of the app first; set worldParameters.sessionCookie to the name of its session cookie.' : 'Log in with remember-me ticked first; set worldParameters.rememberMeCookie to the name of the app\'s remember-me cookie.' });
  }
  const has = flag === 'HttpOnly' ? cookie.httpOnly : cookie.secure;
  if (Boolean(notCase) === Boolean(has)) {
    throw friendly({
      message: `The ${which} cookie "${name}" is ${notCase ? '' : 'not '}${flag} (HttpOnly: ${cookie.httpOnly}, Secure: ${cookie.secure}).`,
      hint: 'Behind a proxy that ends HTTPS the app must read its forwarded headers (server.forward-headers-strategy) to mark its cookies Secure; server.servlet.session.cookie.* sets the session cookie\'s flags.',
    });
  }
});

/**
 * Assert how long the remember-me cookie keeps the browser signed in, in days (Spring Security's default is 14),
 * give or take an hour.
 *
 * Example #1: Then the remember-me cookie should last 14 days
 * Example #2: And the remember-me cookie should last 14 days
 * Example #3: Then the remember-me cookie should last 30 days
 * Example #4: Then the remember-me cookie should last 7 days
 * Example #5: And the remember-me cookie should last 1 day
 */
Then(/^the remember-me cookie should last (\d+) days?$/, async function (days) {
  const name = rememberMeCookieName(this);
  const cookie = await cookieNamed(this, name);
  if (!cookie) {
    throw friendly({ message: `The browser holds no remember-me cookie ("${name}").`, hint: 'Log in with remember-me ticked first; set worldParameters.rememberMeCookie to the name of the app\'s remember-me cookie.' });
  }
  if (cookie.expires <= 0) {
    throw friendly({ message: `The remember-me cookie "${name}" is a session cookie: it ends with the browser.`, hint: 'A remember-me token outlives the browser: its cookie has an expiry.' });
  }
  const left = (cookie.expires * 1000 - Date.now()) / 86400000;
  if (Math.abs(left - Number(days)) > 1 / 24) {
    throw friendly({ message: `The remember-me cookie "${name}" lasts ${left.toFixed(2)} days, not ${days}.`, hint: 'rememberMe().tokenValiditySeconds(...) sets it (14 days by default).' });
  }
});



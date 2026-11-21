'use strict';

// Who may open what, and the CSRF protection: a page open or refused to the session of the browser (a visitor is
// sent to the login page, a signed-in account without the role gets the access-denied answer, 403), a form sent
// with a forged token or from a page of another site (refused, 403), and the CSRF token every form that posts
// must carry.
//
// Spring Security keeps the token in the session and Thymeleaf writes it into every form with a th:action as a
// hidden field (`_csrf`, `worldParameters.csrfParameter`); a form without a th:action needs the field written by
// hand, or every one of its saves is refused.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  listed,
  siteUrl,
  csrfParameter,
  open,
  navigating,
  settle,
  onLoginPage,
  documentStatus,
  describePage,
} = require('./spring-boot-helpers');

/**
 * Assert that the session of the browser may, or may not, open a page of the app. Refused means: a visitor is
 * sent to the login page, a signed-in account gets the access-denied answer (HTTP 403, on the app's error page or
 * the default one). Allowed means neither. Management endpoints (`/actuator/env`) are pages like any other here.
 *
 * Example #1: Then I should not be allowed to open "/owners/new"
 * Example #2: Then I should be allowed to open "/owners/find"
 * Example #3: And we should not be allowed to open "/actuator/env"
 * Example #4: Then I should be allowed to open "/owners/1/edit"
 * Example #5: But we should not be allowed to open "/owners/1/pets/1/edit"
 */
Then(/^(I |we )*should( not)* be allowed to open "([^"]*)"$/, async function (pronounCase, notCase, path) {
  await open(this, siteUrl(this, path));
  const status = await documentStatus(this);
  const toLogin = await onLoginPage(this);
  const refused = toLogin || status === 403 || status === 401;
  const what = toLogin ? 'the browser was sent to the login page' : `it answered HTTP ${status === null ? '(status unknown)' : status}`;
  if (notCase && !refused) {
    throw friendly({ message: `Expected ${path} to be refused to this session, but ${what} (${await describePage(this)}).`, hint: 'A refusal is the login page for a visitor and HTTP 403 for a signed-in account without the role: check the security rules of the app (requestMatchers(...).hasRole(...)).' });
  }
  if (!notCase && refused) {
    throw friendly({ message: `Expected ${path} to open for this session, but ${what}.`, hint: toLogin ? 'Log in first (I am a logged in user with the "..." user).' : 'The account lacks the role the security rules of the app ask for that page.' });
  }
});

// The fields that carry the CSRF token of a form.
function tokenSelector(world) {
  return `input[name="${String(csrfParameter(world)).replace(/["\\]/g, '\\$&')}"]`;
}

/**
 * Press a button of a form after replacing the CSRF token of its form with one the app never gave (what a forged
 * request carries), as an attacker who copies a form does. The app must refuse it with HTTP 403: assert that with
 * "I should see the 403 error page", and that nothing changed.
 *
 * Example #1: When I press "Update Owner" with a forged token
 * Example #2: When we press "Log out" with a forged token
 * Example #3: And I press "Sign in" with a forged token
 * Example #4: When I press "Add Visit" with a forged token
 * Example #5: And I press "Log Out" with a forged token
 */
When(/^(I |we )*press "([^"]*)" with a forged token$/, async function (pronounCase, label) {
  const button = this.page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first();
  if (!(await button.count())) {
    throw friendly({ message: `No button "${label}" is on the page (${await describePage(this)}).`, hint: 'Name the button as the page writes it.' });
  }
  const forged = await button.evaluate((el, selector) => {
    const form = el.form || el.closest('form');
    if (!form) return -1;
    const fields = [...form.querySelectorAll(selector)];
    for (const field of fields) field.value = 'forged-token';
    return fields.length;
  }, tokenSelector(this));
  if (forged < 1) {
    throw friendly({
      message: forged < 0 ? `The button "${label}" is not part of a form.` : `The form of the button "${label}" carries no CSRF token ("${csrfParameter(this)}").`,
      hint: 'A form that posts carries its token in a hidden field (_csrf). Thymeleaf writes it into forms with a th:action; a form without one needs it written by hand.',
    });
  }
  await navigating(this, () => button.click(), { label: `Pressing "${label}" with a forged token` });
});

/**
 * Send a form to an address of the app from a page of another site, as a forged form on somebody else's page
 * does: the browser posts it with a token the app never gave. The app must refuse it with HTTP 403: assert that
 * with "I should see the 403 error page", and that nothing changed.
 *
 * Example #1: When a page of another site sends a form to "/owners/1/edit"
 * Example #2: When a page of another site sends a form to "/logout"
 * Example #3: And a page of another site sends a form to "/owners/1/pets/1/visits/new"
 * Example #4: When a page of another site sends a form to "/login"
 * Example #5: When a page of another site sends a form to "/owners/new"
 */
When(/^a page of another site sends a form to "([^"]*)"$/, async function (path) {
  const action = siteUrl(this, path);
  const page = this.page;
  await page.goto('about:blank');
  const fields = { [csrfParameter(this)]: 'a-token-of-another-site', firstName: 'Forged', description: 'Forged', username: 'nobody', password: 'not-a-password' };
  const inputs = Object.entries(fields).map(([name, value]) => `<input type="hidden" name="${name}" value="${value}">`).join('');
  await page.setContent(`<!doctype html><title>Another site</title><form method="post" action="${action.replace(/"/g, '&quot;')}">${inputs}<button type="submit">Send</button></form>`);
  await navigating(this, () => page.locator('button[type="submit"]').click(), { label: `The form of the other site sent to ${action}`, hint: 'Check launchUrl in cucumber.js.' });
});

/** The forms of the page that post, with their token: [{name, token}] named by their submit button, id or action. */
async function postingForms(world) {
  return world.page.locator('form').evaluateAll((forms, selector) => forms
    .filter((f) => (f.getAttribute('method') || 'get').toLowerCase() === 'post')
    .map((f) => {
      const button = f.querySelector('button, input[type="submit"]');
      const name = (button && (button.textContent.trim() || button.value)) || f.id || f.getAttribute('action') || '(a form)';
      const field = f.querySelector(selector);
      return { name: name.replace(/\s+/g, ' ').trim(), token: field ? field.value : null };
    }), tokenSelector(world));
}

/**
 * Assert that every form of the page that posts carries a CSRF token (a hidden `_csrf` field with a value).
 * Without one, Spring Security refuses every one of its saves with HTTP 403.
 *
 * Example #1: Then every form that posts on this page should carry a CSRF token
 * Example #2: And every form that posts on this page should carry a CSRF token
 * Example #3: Then every form that posts on this page should carry a CSRF token
 * Example #4: But every form that posts on this page should carry a CSRF token
 * Example #5: Then every form that posts on this page should carry a CSRF token
 */
Then(/^every form that posts on this page should carry a CSRF token$/, async function () {
  await settle(this);
  const forms = await postingForms(this);
  if (!forms.length) {
    throw friendly({ message: `No form of this page posts (${await describePage(this)}).`, hint: 'Open a page with a form that sends data first.' });
  }
  const without = forms.filter((f) => !f.token);
  if (without.length) {
    throw friendly({
      message: `${without.length} of the ${forms.length} forms that post on this page carry no CSRF token ("${csrfParameter(this)}"): ${listed(without.map((f) => f.name))}.`,
      hint: 'Thymeleaf writes the token into a form with a th:action; for a form without one, add <input type="hidden" th:name="${_csrf.parameterName}" th:value="${_csrf.token}"/>.',
    });
  }
});

/**
 * Assert that the form of a button carries, or does not carry, a CSRF token (a hidden `_csrf` field with a
 * value). A form that sends with GET never carries one.
 *
 * Example #1: Then the form of the "Update Owner" button should carry a CSRF token
 * Example #2: And the form of the "Log out" button should carry a CSRF token
 * Example #3: Then the form of the "Find Owner" button should not carry a CSRF token
 * Example #4: Then the form of the "Add Visit" button should carry a CSRF token
 * Example #5: And the form of the "Sign in" button should carry a CSRF token
 */
Then(/^the form of the "([^"]*)" button should( not)* carry a CSRF token$/, async function (label, notCase) {
  await settle(this);
  const button = this.page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first();
  try {
    await button.waitFor({ state: 'visible', timeout: budget(this) });
  } catch {
    throw friendly({ message: `No button "${label}" is on the page (${await describePage(this)}).`, hint: 'Name the button as the page writes it.' });
  }
  const form = await button.evaluate((el, selector) => {
    const f = el.form || el.closest('form');
    if (!f) return null;
    const field = f.querySelector(selector);
    return { method: (f.getAttribute('method') || 'get').toLowerCase(), token: field ? field.value : null };
  }, tokenSelector(this));
  if (!form) {
    throw friendly({ message: `The button "${label}" is not part of a form.`, hint: 'Name the submit button of the form.' });
  }
  if (!notCase && !form.token) {
    throw friendly({
      message: `The form of the button "${label}" carries no CSRF token ("${csrfParameter(this)}")${form.method === 'get' ? ': it sends with GET, which needs none' : ''}.`,
      hint: form.method === 'get' ? 'Only a form that posts carries a token.' : 'Thymeleaf writes the token into a form with a th:action; for a form without one, add <input type="hidden" th:name="${_csrf.parameterName}" th:value="${_csrf.token}"/>.',
    });
  }
  if (notCase && form.token) {
    throw friendly({ message: `The form of the button "${label}" carries a CSRF token.`, hint: 'A form that posts carries one; a form that sends with GET does not.' });
  }
});

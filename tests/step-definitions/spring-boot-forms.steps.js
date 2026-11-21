'use strict';

// Server-rendered forms: the validation messages a refused form prints next to its fields (the message of
// `th:errors`, or of the JSP `<form:errors>` tag, from the constraints of the form's object), the errors of a whole
// form, and the messages of a page after an action (a flash message the app set before its redirect, an alert).
//
// A refused form comes back with the page of the form (the POST answers 200 with the errors); a saved form
// redirects to another page, which shows the flash message once.

const { Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const { clean, listed, settle, findField, fieldErrors, refusedFields, pageMessages, eventually } = require('./spring-boot-helpers');

/**
 * Assert that a field shows, or does not show, an error message (the message of a refused value, next to the
 * field). The field is found by its label as the page writes it, or by its name attribute.
 *
 * Example #1: Then the "Telephone" field should have the error "Telephone must be a 10-digit number"
 * Example #2: Then the "First Name" field should have the error "must not be blank"
 * Example #3: And the "Name" field should have the error "is already in use"
 * Example #4: Then the "Birth Date" field should have the error "invalid date"
 * Example #5: Then the "First Name" field should not have the error "must not be blank"
 */
Then(/^the "([^"]*)" field should( not)* have the error "([^"]*)"$/, async function (name, notCase, message) {
  await settle(this);
  const field = await findField(this, name);
  if (notCase) {
    const errors = await fieldErrors(field);
    if (errors.some((e) => clean(e) === clean(message))) {
      throw friendly({ message: `The "${name}" field has the error "${message}".`, hint: 'The value of the field was refused: check what was filled in.' });
    }
    return;
  }
  await eventually(this, () => fieldErrors(field), (errors) => errors.some((e) => clean(e) === clean(message)), (errors) => ({
    message: `The "${name}" field does not have the error "${message}". Its errors: ${listed(errors)}.`,
    hint: 'The form prints the message of a refused value next to its field once the form was sent; name the message as the page writes it.',
  }));
});

/**
 * Assert that a field shows no error message.
 *
 * Example #1: Then the "Last Name" field should have no error
 * Example #2: And the "City" field should have no error
 * Example #3: Then the "Telephone" field should have no error
 * Example #4: Then the "Description" field should have no error
 * Example #5: But the "Address" field should have no error
 */
Then(/^the "([^"]*)" field should have no error$/, async function (name) {
  await settle(this);
  const field = await findField(this, name);
  const errors = await fieldErrors(field);
  if (errors.length) {
    throw friendly({ message: `The "${name}" field has the error${errors.length > 1 ? 's' : ''} ${listed(errors)}.`, hint: 'The value of the field was refused: check what was filled in.' });
  }
});

/**
 * Assert the errors of a refused form, field by field: each field of the table has its error, and no other field
 * of the page has one.
 *
 * Example #1: Then the form should show the errors:
 * Example #2: And the form should show the errors:
 * Example #3: Then the form should show the errors:
 * Example #4: But the form should show the errors:
 * Example #5: Then the form should show the errors:
 */
Then(/^the form should show the errors:$/, async function (table) {
  await settle(this);
  const wanted = table.raw().map(([field, message]) => ({ field: clean(field), message: clean(message) }));
  for (const { field, message } of wanted) {
    const errors = await fieldErrors(await findField(this, field));
    if (!errors.some((e) => clean(e) === message)) {
      throw friendly({ message: `The "${field}" field does not have the error "${message}". Its errors: ${listed(errors)}.`, hint: 'Name the field by its label and the message as the page writes it.' });
    }
  }
  const others = (await refusedFields(this)).filter((r) => !wanted.some((w) => w.field.toLowerCase() === r.field.toLowerCase()));
  if (others.length) {
    throw friendly({ message: `Other fields have errors too: ${others.map((r) => `"${r.field}" (${r.errors.join('; ')})`).join(', ')}.`, hint: 'List every refused field of the form in the table.' });
  }
});

/**
 * Assert that no field of the page shows an error message.
 *
 * Example #1: Then the form should show no errors
 * Example #2: And the form should show no errors
 * Example #3: Then the form should show no errors
 * Example #4: But the form should show no errors
 * Example #5: Then the form should show no errors
 */
Then(/^the form should show no errors$/, async function () {
  await settle(this);
  const refused = await refusedFields(this);
  if (refused.length) {
    throw friendly({ message: `Fields of the page have errors: ${refused.map((r) => `"${r.field}" (${r.errors.join('; ')})`).join(', ')}.`, hint: 'A value of the form was refused: check what was filled in.' });
  }
});

/**
 * Assert a message the page shows after an action: a flash message the app set before its redirect (shown once,
 * on the page after it), or an alert of the page. With a kind, the message must be of that kind (success, error,
 * warning, info), read from its class (`alert-success`, `alert-danger`, `alert-warning`, `alert-info`).
 *
 * Example #1: Then I should see the success message "Owner Values Updated"
 * Example #2: Then I should see the error message "Invalid credentials"
 * Example #3: And I should see the message "You have been signed out"
 * Example #4: Then I should not see the success message "Owner Values Updated"
 * Example #5: Then we should see the success message "You have been signed out"
 */
Then(/^(I |we )*should( not)* see the (?:(success|error|warning|info) )?message "([^"]*)"$/, async function (pronounCase, notCase, kind, message) {
  const matches = (list) => list.some((m) => clean(m.text) === clean(message) && (!kind || m.kind === kind));
  if (notCase) {
    await settle(this);
    if (matches(await pageMessages(this))) {
      throw friendly({ message: `Expected not to see the ${kind ? kind + ' ' : ''}message "${message}", but the page shows it.`, hint: 'A flash message is shown once, on the page after the action that set it.' });
    }
    return;
  }
  await eventually(this, () => pageMessages(this), matches, (list) => ({
    message: `The page does not show the ${kind ? kind + ' ' : ''}message "${message}". It shows: ${list.length ? list.map((m) => `"${m.text}"${m.kind ? ` (${m.kind})` : ''}`).join(', ') : '(none)'}.`,
    hint: 'A flash message is shown once, on the page after the action that set it; name it as the page writes it.',
  }));
});

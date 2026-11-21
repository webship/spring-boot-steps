'use strict';

// The health endpoint and the info endpoint of the management endpoints: the status the app reports, the
// components and the groups of its health (the details only for the accounts the app allows, so the same request
// shows more to an administrator than to a visitor), and the build and git facts of its info.
//
// Every request is a program's request with the browser's session (`Accept: application/json`): what the step
// reads is what the account of the scenario may see. The paths are `worldParameters.healthPath`
// (/actuator/health) and `worldParameters.infoPath` (/actuator/info).

const { Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const { listed, healthPath, infoPath, programRequest, programJson, valueAt } = require('./spring-boot-helpers');

/** The health of the app as this session may see it. */
async function health(world, sub = '') {
  const path = healthPath(world) + (sub ? `/${sub}` : '');
  return (await programJson(world, path, { what: `The health endpoint (${path})`, hint: 'Open it to anybody in the security rules of the app, or log in first. Check worldParameters.healthPath.' })).json;
}

/**
 * Assert the status the health endpoint reports to this session ("UP", "DOWN", "OUT_OF_SERVICE").
 *
 * Example #1: Then the health endpoint should report "UP"
 * Example #2: And the health endpoint should report "UP"
 * Example #3: Then the health endpoint should report "DOWN"
 * Example #4: Then the health endpoint should report "OUT_OF_SERVICE"
 * Example #5: But the health endpoint should report "UP"
 */
Then(/^the health endpoint should report "([^"]*)"$/, async function (status) {
  const json = await health(this);
  if (json.status !== status) {
    throw friendly({ message: `The health endpoint reports "${json.status}", not "${status}"${json.components ? ` (components: ${Object.entries(json.components).map(([k, v]) => `${k} ${v.status}`).join(', ')})` : ''}.`, hint: 'The status is the worst of the components\' status; an administrator sees which one.' });
  }
});

/**
 * Assert that the health endpoint shows, or does not show, a component to this session ("db", "diskSpace",
 * "ping"). The app shows the components only to the accounts it allows
 * (management.endpoint.health.show-details=when-authorized with management.endpoint.health.roles).
 *
 * Example #1: Then the health endpoint should show the component "db"
 * Example #2: Then the health endpoint should not show the component "db"
 * Example #3: And the health endpoint should show the component "diskSpace"
 * Example #4: Then the health endpoint should show the component "ping"
 * Example #5: But the health endpoint should not show the component "diskSpace"
 */
Then(/^the health endpoint should( not)* show the component "([^"]*)"$/, async function (notCase, name) {
  const json = await health(this);
  const components = json.components || {};
  const has = Object.prototype.hasOwnProperty.call(components, name);
  if (!notCase && !has) {
    throw friendly({ message: `The health endpoint shows no component "${name}" to this session. It shows: ${listed(Object.keys(components))}.`, hint: json.components ? 'Name the component as the endpoint does ("db", "diskSpace", "ping").' : 'The details are shown only to the accounts the app allows: log in as one (management.endpoint.health.roles).' });
  }
  if (notCase && has) {
    throw friendly({ message: `The health endpoint shows the component "${name}" to this session (${components[name].status}).`, hint: 'management.endpoint.health.show-details=when-authorized keeps the details for the accounts of management.endpoint.health.roles.' });
  }
});

/**
 * Assert that the health endpoint shows this session its status only, with no component.
 *
 * Example #1: Then the health endpoint should show no components
 * Example #2: And the health endpoint should show no components
 * Example #3: Then the health endpoint should show no components
 * Example #4: But the health endpoint should show no components
 * Example #5: Then the health endpoint should show no components
 */
Then(/^the health endpoint should show no components$/, async function () {
  const json = await health(this);
  if (json.components) {
    throw friendly({ message: `The health endpoint shows this session its components: ${listed(Object.keys(json.components))}.`, hint: 'A visitor should see the status only: management.endpoint.health.show-details=when-authorized (or never).' });
  }
});

/**
 * Assert the status of one component of the health ("db", "diskSpace"), read from its own path
 * (/actuator/health/db): the app answers it only to the accounts that may see the details.
 *
 * Example #1: Then the health component "db" should report "UP"
 * Example #2: And the health component "diskSpace" should report "UP"
 * Example #3: Then the health component "ping" should report "UP"
 * Example #4: Then the health component "db" should report "DOWN"
 * Example #5: But the health component "db" should report "UP"
 */
Then(/^the health component "([^"]*)" should report "([^"]*)"$/, async function (name, status) {
  const path = `${healthPath(this)}/${name}`;
  const answer = await programRequest(this, path);
  if (answer.status === 404 || answer.redirected || !answer.json) {
    throw friendly({ message: `The health component "${name}" is not shown to this session (${path}: ${answer.redirected ? 'a redirect' : `HTTP ${answer.status}`}).`, hint: 'A component is answered only to the accounts that may see the details (management.endpoint.health.roles): log in as one. Name it as the endpoint does.' });
  }
  if (answer.json.status !== status) {
    throw friendly({ message: `The health component "${name}" reports "${answer.json.status}", not "${status}".`, hint: answer.json.details ? `Its details: ${JSON.stringify(answer.json.details).slice(0, 160)}.` : 'Its details are shown to the accounts that may see them.' });
  }
});

/**
 * Assert the status of a health group ("liveness" and "readiness", the probes of an app that runs in a cluster),
 * read from its own path (/actuator/health/liveness).
 *
 * Example #1: Then the health group "liveness" should report "UP"
 * Example #2: And the health group "readiness" should report "UP"
 * Example #3: Then the health group "readiness" should report "OUT_OF_SERVICE"
 * Example #4: Then the health group "liveness" should report "DOWN"
 * Example #5: But the health group "readiness" should report "UP"
 */
Then(/^the health group "([^"]*)" should report "([^"]*)"$/, async function (name, status) {
  const top = await health(this);
  if (top.groups && !top.groups.includes(name)) {
    throw friendly({ message: `The health endpoint has no group "${name}". Its groups: ${listed(top.groups)}.`, hint: 'The probes (liveness, readiness) are there when management.endpoint.health.probes.enabled is true or the app runs in a cluster; management.endpoint.health.group.<name> adds others.' });
  }
  const json = await health(this, name);
  if (json.status !== status) {
    throw friendly({ message: `The health group "${name}" reports "${json.status}", not "${status}".`, hint: 'A group reports the worst status of its members.' });
  }
});

/**
 * Assert a fact of the info endpoint (/actuator/info) by its dotted path: the build's ("build.name",
 * "build.version") or the git commit's ("git.commit.id"), as the app publishes them.
 *
 * Example #1: Then the info endpoint should show "build.name" as "petclinic"
 * Example #2: And the info endpoint should show "build.encoding.source" as "UTF-8"
 * Example #3: Then the info endpoint should show "build.version" as "4.0.0-SNAPSHOT"
 * Example #4: Then the info endpoint should show "git.commit.id" as "500158f"
 * Example #5: Then the info endpoint should show "build.java.source" as "17"
 */
Then(/^the info endpoint should show "([^"]*)" as "([^"]*)"$/, async function (key, value) {
  const path = infoPath(this);
  const answer = await programJson(this, path, { what: `The info endpoint (${path})`, hint: 'Open it in the security rules of the app (and expose it: management.endpoints.web.exposure.include). Check worldParameters.infoPath.' });
  const found = valueAt(answer.json, key);
  if (found === undefined) {
    throw friendly({ message: `The info endpoint has no "${key}". It has: ${listed(Object.keys(answer.json))}.`, hint: 'The build facts come from the build-info goal of the build plugin, the git facts from a git.properties of the build.' });
  }
  if (String(found) !== value) {
    throw friendly({ message: `The info endpoint shows "${key}" as "${typeof found === 'object' ? JSON.stringify(found) : found}", not "${value}".`, hint: 'Name the value as the endpoint does.' });
  }
});

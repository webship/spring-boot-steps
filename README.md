<p align="center"><img src="https://raw.githubusercontent.com/webship/spring-boot-steps/2.0.x/assets/logo.svg" alt="Spring Boot logo" width="96"></p>

# spring-boot-steps

[![Test](https://github.com/webship/spring-boot-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/spring-boot-steps/actions/workflows/test.yml)

Cucumber step definitions for what Spring Boot and Spring Security give every app, with
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation harness built on Playwright and
Cucumber-js.

A Spring Boot app has no fixed pages of its own, but the framework gives every app the same pieces, and those are
what a tester meets first and what most often breaks when an app adds a login or changes its configuration.
`@webship-js/spring-boot-steps` covers them:

- **the session**: the login page Spring Security generates (or the app's own) and its refusal ("Invalid
  credentials"), logging in by a handle of the users registry or taking over an account's session from earlier in
  the run, the page asked for before the login opening after it, the new session id a login gives (session
  fixation), logging out through the app's button or the generated confirmation page, who is signed in;
- **remember-me**: the token that outlives a closed browser, its cookie and how long it lasts, a logout taking it
  away, and a session that ended on the server (what a session timeout leaves) sending the browser to the login
  page, or being taken up again by remember-me;
- **who may open what**: a page open or refused to the session of the browser (a visitor is sent to the login page,
  an account without the role gets the access-denied answer, 403), the management endpoints included;
- **the CSRF protection**: every form that posts carries its token, a form sent with a forged token or from a page
  of another site is refused (403), and nothing changes;
- **the error pages**: the page of a status, the app's own error page or the framework's default one ("Whitelabel
  Error Page", what an app without an error page shows), no debug information on a live app (no stack trace, no
  exception), and the JSON error a program gets, without a trace or the exception message;
- **the health endpoint**: the status anybody may ask for, the components and the groups (liveness, readiness) the
  app shows only to the accounts it allows, and the build facts of the info endpoint;
- **server-rendered forms**: the validation message next to each refused field, the errors of a whole form, and the
  flash message of a saved form, shown once.

No step phrase names the platform: a scenario reads `When my session expires` and
`Then the default error page should say "Not Found" with the status 404`.

CI builds three real apps with [DDEV](https://ddev.com) on the runner and runs their suites twice on every push
and pull request, then the assertions that must fail; see [The test apps](#the-test-apps) and
[`.github/workflows/test.yml`](.github/workflows/test.yml).

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, Python 3, and Node.js 20 or later with npm. The app
is built and runs in its container, on the current long-term-support JDK: no Java on the machine, no public domain
and no account anywhere. The app needs about 500 MB of memory once it runs.

**1. The site.** The pack's own build script (the one CI runs) makes a DDEV project with the Spring PetClinic
sample at the current Spring Boot release (4.2.0), Spring Security added by the build (form login with the
generated login and logout pages, remember-me, the role rules, in-memory accounts named after their roles), built
with the sample's own Maven wrapper on Eclipse Temurin 25 and run as a production jar. It takes about five minutes
the first time (the JDK's image and the app's libraries, about 400 MB together) and two after that.

```bash
git clone https://github.com/webship/spring-boot-steps.git
SITE_DIR="$PWD/spring-boot-site" spring-boot-steps/.github/scripts/build-ddev-site.sh
```

The app answers at `https://springbootsteps.ddev.site`. The accounts are `administrator` (the ADMIN role) and
`user` (the USER role), each with the password `dD.123123ddd`.

In the [Webship Workspace](https://github.com/webship/workspace), its Spring Boot plugin builds the same site
instead, in a sites folder of the workspace (`dev/` here, the one `--with-needs` adds to a new workspace; `test/`,
`sandboxes/` and `demos/` work the same):

```bash
bash core/scripts/plugins.sh --require spring-boot --with-needs
bash core/scripts/plugins.sh --activate spring-boot --with-needs
bash core/scripts/plugins.sh --install spring-boot
bash dev/cmd-spring-boot-project.sh sbsite --petclinic --install --add-users
```

That site answers at `https://sbsite.ddev.site`. Its accounts are the plugin's: the same two, `administrator` and
`user`, with the workspace's shared password `dD.123123ddd`. Without `--petclinic` the builder makes a new app with
Spring Initializr instead (the app of `tests/new-app/`); the plugin's README says how to manage the app and its
accounts with its tool (`cmd-tools-spring-boot-cli.sh sbsite --add-users`).

**2. A test project.**

```bash
mkdir spring-boot-tests && cd spring-boot-tests
npm init -y
npm install --save-dev webship-js @webship-js/spring-boot-steps
npx init-webship-js
```

`npx init-webship-js` writes `cucumber.js`, `playwright.config.ts`, the `tests/` folders with a first feature and
the `npm test` scripts, and installs Chromium. npm usually runs it already when it installs webship-js; a second run
changes nothing. Its first feature opens the app's home page: it passes, and can stay.

**3. `cucumber.js`.** Replace the file with the wiring of the pack: the step files of webship-js and of the pack,
the tags that keep the assertions that must fail out of a normal run, the pages of the app the steps need, and the
accounts (the JSON of [Test users](#test-users)). The first lines are the starter's own: a feature named on the
command line runs alone (step 5).

```javascript
// A feature file or a scenario (file:line) named on the command line runs alone:
// cucumber-js 12 would add it to the paths below, so `paths` is left empty then.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  if (!/cucumber(-js|\.js)?$/.test(String(process.argv[1] || ''))) return [];
  const args = process.argv.slice(2);
  const paths = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('-')) {
      if (OPTIONS_WITH_A_VALUE.has(args[i])) i += 1;
    } else {
      paths.push(args[i]);
    }
  }
  return paths;
}

const launchUrl = (process.env.LAUNCH_URL || 'https://springbootsteps.ddev.site').replace(/\/+$/, '');

module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',
      'node_modules/@webship-js/spring-boot-steps/tests/step-definitions/**/*.js',
      'tests/step-definitions/**/*.js',
    ],
    paths: commandLinePaths().length ? [] : ['tests/features/**/*.feature'],
    // Work in progress and the assertions that must fail stay out of a normal run.
    tags: 'not @wip and not @must-fail',
    format: ['@cucumber/pretty-formatter', 'json:tests/reports/cucumber_report.json'],
    worldParameters: {
      launchUrl,
      // The login page (the generated one, or the app's own), the logout page, a page only a signed-in account may
      // open, and the health and info endpoints.
      loginPath: '/login',
      logoutPath: '/logout',
      protectedPath: '/owners/find',
      healthPath: '/actuator/health',
      infoPath: '/actuator/info',
      // The cookies of the session and of remember-me, and the field of a form that carries its CSRF token.
      sessionCookie: 'JSESSIONID',
      rememberMeCookie: 'remember-me',
      csrfParameter: '_csrf',
      // Browser messages: the browser logs every error page it gets ("Failed to load resource: the server responded
      // with a status of 403 ()"), and the pages Spring Security generates name no icon, so a signed-in browser asks
      // for /favicon.ico, a 404 logged with the same words. The message carries no address, so no pattern can tell
      // that one apart: the scenarios that meet them carry @js-off.
      javascript: { mode: 'warn', levels: ['error'], beforeScenario: false, afterScenario: true },
      minWaitTime: { page: 3000, before_scenario: 0, after_scenario: 0, before_step: 0, after_step: 0 },
      users: {
        administrator: { username: 'administrator', password: 'dD.123123ddd' },
        user: { username: 'user', password: 'dD.123123ddd' },
      },
    },
  },
};
```

On the site from the Webship Workspace (step 1) the accounts are the same; its address goes in `LAUNCH_URL`
(step 5).

**4. A first feature**, `tests/features/first-run.feature`:

```gherkin
Feature: First run
  Scenario: A visitor is sent to the login page, and back to the page after the login
    Given I am not logged in
    When I go to "/owners/find"
    Then I should be on the login page
    When I log in as "user" with the login form
    Then I should be back on the page I asked for
    And I should be logged in as "user"

  Scenario: Anybody sees whether the app is up, and nothing more
    Given I am not logged in
    Then the health endpoint should report "UP"
    And the health endpoint should show no components
```

**5. Run it.** Set `LAUNCH_URL` to the address of the app: `https://springbootsteps.ddev.site` for the build
script's site, `https://sbsite.ddev.site` for the Workspace's.

```bash
LAUNCH_URL=https://springbootsteps.ddev.site npm test
```

A green first run prints every step, then the summary (the scenarios above and the starter's, passed) and the HTML
report it wrote:

```
3 scenarios (3 passed)
11 steps (11 passed)
0m05.000s (executing steps: 0m04.900s)
[webship-js] HTML report → …/spring-boot-tests/tests/reports/cucumber_report.html
```

One feature runs alone when the command line names it (a scenario too, with its line):

```bash
LAUNCH_URL=https://springbootsteps.ddev.site npx cucumber-js tests/features/first-run.feature
```

From there, copy the features of [`tests/features/`](tests/features/) (they also ship in the package, under
`node_modules/@webship-js/spring-boot-steps/tests/features/`). Together with the features of the other two test
apps they use every step of the pack. They run as they are on the site of either way of step 1, and leave its data
as they found it; they read no file of their own.

For your own app, point `launchUrl` at it, `loginPath` and `logoutPath` at its login and logout pages (the generated
ones are `/login` and `/logout`), `protectedPath` at a page only a signed-in account may open, the cookie names at
its own if it changed them, and `users` at its test accounts (`name`: the name the app shows for the signed-in
account, when it is not the username). The steps read what Spring Security and Spring Boot draw the same way in
every app; the app's own words (`Signed in as user`, its menus) are read with webship-js's `I should see "…"`.

### What the suite tests

The features of this repository run every step of the pack against three apps, twice in a row in CI on every
change:

- `tests/features/` on the PetClinic sample with Spring Security (40 scenarios): a visitor sent to the login page and
  back to the page asked for after the login; each account logging in, with a new session id; the login page of a
  signed-in account asking for its password again; a wrong password and an unknown account refused with the same
  words; the logout button, and the generated logout page that asks first; the session cookie HttpOnly and Secure;
  remember-me outliving a closed browser, its cookie (14 days, HttpOnly, Secure), a login without it, a logout taking
  it away, a session that ended sending the browser to the login page or taken up by remember-me; the pages each role
  may open, the access-denied answer on the app's own error page, the management endpoints by role, the JSON 403 of a
  program; every posting form carrying its token, a forged token in a form, in the logout and in the login form, and a
  form from another site, all refused with nothing changed; the app's own 500 and 404 pages, no debug information, a
  visitor sent to the login page for a missing page, the JSON error without a trace; the health by role, its groups,
  the info endpoint; the refusals of the owner, pet and visit forms field by field, and the flash message of a saved
  form shown once;
- `tests/new-app/` on a new app made with Spring Initializr, with Spring Security added (12 scenarios): the generated
  login page, the default error page after the login (404), the access-denied answer on it (403), the forged login
  form, the generated logout page, remember-me and a session that ended, the health by role, the management endpoints
  a new app does not expose, the JSON error of a missing page;
- `tests/without-security/` on the sample as it is, at its own Spring Boot release, without a login (10
  scenarios): the app's own error pages, no login page, every page open, a form without a token, the form refusals
  and the flash message, the health, the JSON error;
- `tests/must-fail/` (41 scenarios): an assertion that is not true for each step, which must fail with its message
  and a hint.

Not tested: OAuth 2.0 and OpenID Connect logins, SAML, one-time-token and passkey logins, HTTP Basic, the reactive
stack (WebFlux), a database other than the apps' own in-memory one, an app's own login page beyond the generated
one (the steps find its form the same way), and languages other than English (the steps read the words of the
generated pages: "Please sign in", "Invalid credentials", "You have been signed out", "Are you sure you want to log
out?").

## Requirements

- Node.js 20 or later
- A webship-js 2.0 test project (webship-js 2.0.16 or later)
- A Spring Boot app (4.x; the steps hold on 4.1 and 4.2) with Spring Security 7 for the login steps, and accounts
  for the suite

## Install

```bash
npm install --save-dev @webship-js/spring-boot-steps
```

## The test apps

The suite runs against three apps, each built in a DDEV project by
[`.github/scripts/build-ddev-site.sh`](.github/scripts/build-ddev-site.sh):

- **The Spring PetClinic sample with Spring Security** (`APP=petclinic`, the default): the official sample
  application of the Spring projects ([github.com/spring-projects/spring-petclinic](https://github.com/spring-projects/spring-petclinic),
  Apache-2.0) at the current Spring Boot release. It was chosen because it is the app most Spring developers know,
  and it has what people meet in real apps: CRUD pages for owners, pets and visits, server-rendered forms with
  validation messages, flash messages, pagination, an error page of its own and the management endpoints. It has no
  login, so the build adds Spring Security the way an app adds it: the starter, a security configuration with form
  login, remember-me and role rules, in-memory accounts named after their roles, and "Signed in as" with a "Log out"
  button in its navigation. One more change was needed, and it is a finding the pack's steps catch: the sample's
  three forms that post (owner, pet, visit) have no `th:action`, so Thymeleaf adds no CSRF token to them and Spring
  Security refuses every one of their saves with 403; the build adds the hidden token field Spring Security's
  reference gives for such forms.
- **A new app made with Spring Initializr** (`APP=new`): the official way to start an app (start.spring.io, with web,
  Thymeleaf, validation, the management endpoints, JPA with an in-memory database), with Spring Security added by
  the build. It has no page and no error page of its own: it is where the framework's default error page and the
  generated pages are proven on their own.
- **The sample as it is** (`APP=petclinic SECURITY=off SPRING_BOOT_VERSION=`): unchanged, at its own Spring Boot
  release (4.1.0), with no login: the error pages and the validation steps hold on an app without Spring Security.

## How the steps find things and wait

- **By what a person reads.** A field by the label over it, a button by its words, an account by a handle of the
  users registry, a message by its words. What the framework draws the same way in every app is the fallback: the
  generated login page (`form.login-form`, the fields `username` and `password`, the checkbox `remember-me`, whose
  words "Remember me on this computer." are beside it with no label), the generated logout page
  (`form.logout-form`), the default error page (its heading "Whitelabel Error Page" and its line
  `(type=Not Found, status=404)`), the hidden CSRF field (`_csrf`), and the message a form prints next to a refused
  field (`th:errors` in the classes the common themes give it: `.help-inline`, `.invalid-feedback`, `.text-danger`,
  `[id$=".errors"]`).
- **The app's own signals, no fixed sleeps.** The pages are rendered on the server: an action is a form post and a
  full page load, so a step that acts waits for the page it leads to (the navigation, then the page loaded with no
  request of its own still running), and an assertion waits on the page until it holds or its time is up.
- **Who is signed in** is asked of the app itself: a step opens a page only a signed-in account may open
  (`protectedPath`) and reads whether the app answers it or sends the browser to the login page, and who it names in
  its header or navigation.
- **A session that ended** is one the app no longer knows: the step gives the browser's session cookie an id the app
  never issued, which is what the app sees from a browser whose session timed out (`server.servlet.session.timeout`).
- **A closed browser** keeps its persistent cookies (a remember-me token) and its local storage, and loses its
  session cookies: the step opens a new browser context with those.
- **Status and JSON.** The status a step reads is the one the browser received for the page on screen. A program's
  request is made from the page with the browser's session and `Accept: application/json`, without following a
  redirect: a redirect to the login page is no error answer.
- **Failures say what was found.** `Expected /owners/new to open for this session, but it answered HTTP 403.`,
  `The login page does not say "Bad credentials". It says: "Invalid credentials".`, with a hint on where to look.

## Accounts

The suite never creates or deletes an account. Accounts are configuration: list the ones the app has in
`worldParameters.users`, by a handle the scenarios use, each with its `username` and `password`, and `name` when the
app shows another name for it. An account that signed in once keeps its session for the rest of the run
(`reuseSessions: false` turns it off); a logout ends it.

## Test users

The accounts this repository's suite logs in as, exactly as `cucumber.js` lists them in `worldParameters.users` (the
default values; the `<HANDLE>_USERNAME` and `<HANDLE>_PASSWORD` variables replace them). The build script writes them;
the Workspace's Spring Boot plugin writes the same two.

```json
{
  "administrator": { "username": "administrator", "password": "dD.123123ddd" },
  "user": { "username": "user", "password": "dD.123123ddd" }
}
```

`administrator` has the role ADMIN: it adds and edits owners and pets, opens the management endpoints and sees the
health details. `user` has the role USER: it finds owners and adds visits. They are in-memory accounts of a throwaway
test site, with placeholder passwords stored as bcrypt hashes, not accounts of any real one.

## A test site

[`.github/scripts/build-ddev-site.sh`](.github/scripts/build-ddev-site.sh) builds the site the suite of this
repository runs against:

- a generic DDEV project whose web container runs the app's jar as a daemon, with the router of DDEV sending the
  project's address to the app's port (8080), no database of DDEV's own (the app keeps its data in its own in-memory
  database: every start of the app begins with its data), and Node.js 24 for a suite run in the container;
- the JDK, Eclipse Temurin at `JAVA_VERSION` (25 by default), copied from its official image into the web image;
- the app: PetClinic at `PETCLINIC_REF` (the commit this pack was proven on) with its Spring Boot release set to
  `SPRING_BOOT_VERSION` (4.2.0 by default; empty keeps the sample's own), or a new app from Spring Initializr
  (`APP=new`), prepared by [`site/prepare-app.py`](site/prepare-app.py): Spring Security
  ([`site/security/SecurityConfiguration.java`](site/security/SecurityConfiguration.java), in the package of the app's
  main class), the "Signed in as" part of the sample's navigation, and the CSRF token in the sample's forms;
  `SECURITY=off` leaves the app as it is;
- built with the app's own Maven wrapper in the web container (Maven keeps its downloads in the project, `.m2/`), and
  run behind the router's HTTPS, its forwarded headers read (`server.forward-headers-strategy=native`), the health
  details for the ADMIN role, a remember-me key of its own, and the accounts of [Test users](#test-users) in
  `config/accounts.properties` with bcrypt hashes made in the web container. No password is on a command line.

Run again with `ACCOUNTS_ONLY=1` and the same `SITE_DIR`, the build script writes the accounts again and restarts
the app.

## Steps

### `spring-boot-session.steps.js` (21)

- `Given I am a logged in user with the "administrator" user`
- `Given I am not logged in`
- `Given I am on the login page`
- `When I go to the login page`
- `When I log in as "administrator" with the login form`
- `When I log in with the username "user" and the password "Wrong-password-1"`
- `Then the login should be refused with "Invalid credentials"`
- `Then I should be on the login page`
- `Then I should see the login form`
- `When I log out`
- `When I go to the logout page`
- `Then I should be asked to confirm the logout`
- `When I confirm the logout`
- `Then I should be logged in`
- `Then I should be logged in as "administrator"`
- `When I close the browser and open it again`
- `When my session expires`
- `Then I should be back on the page I asked for`
- `Then the login should have started a new session`
- `Then the session cookie should be HttpOnly`
- `Then the remember-me cookie should last 14 days`

### `spring-boot-access.steps.js` (5)

- `Then I should not be allowed to open "/owners/new"`
- `When I press "Update Owner" with a forged token`
- `When a page of another site sends a form to "/owners/1/edit"`
- `Then every form that posts on this page should carry a CSRF token`
- `Then the form of the "Update Owner" button should carry a CSRF token`

### `spring-boot-errors.steps.js` (7)

- `Then I should see the 404 error page`
- `Then I should see the default error page`
- `Then the default error page should say "Not Found" with the status 404`
- `Then the page should not show debug information`
- `When a program asks for "/oups"`
- `Then the program should get the error "Internal Server Error" with the status 500`
- `Then the error answer should not carry a stack trace`

### `spring-boot-health.steps.js` (6)

- `Then the health endpoint should report "UP"`
- `Then the health endpoint should show the component "db"`
- `Then the health endpoint should show no components`
- `Then the health component "db" should report "UP"`
- `Then the health group "liveness" should report "UP"`
- `Then the info endpoint should show "build.name" as "petclinic"`

### `spring-boot-forms.steps.js` (5)

- `Then the "Telephone" field should have the error "Telephone must be a 10-digit number"`
- `Then the "Last Name" field should have no error`
- `Then the form should show the errors:`
- `Then the form should show no errors`
- `Then I should see the success message "Owner Values Updated"`

Text, links, buttons, fields, cookies, the address and the accessibility checks are webship-js's own steps
(`I should see "…"`, `I press "…"`, `I fill in "…" with "…"`, `a cookie with the name "…" should exist`,
`the path should be "…"`); this pack adds what the framework decides.

## Phrases shared with other packs

The session phrases are the ones every platform pack has, so a feature reads the same on every system (one
`cucumber.js` profile per system; the platform packs are not meant to be loaded together). Loaded beside each of the
36 published packs, these phrases of this pack also match one of theirs:

| Phrase of this pack | Also in |
| --- | --- |
| `I am a logged in user with the "user" user` | codeigniter, discourse, django, django-cms, drupal-core, joomla, keycloak, laravel, mediawiki, moodle, nextcloud, nextjs, odoo, payload, strapi, symfony, typo3, wordpress |
| `I log out`, `I should be logged in`, `I should not be logged in` | codeigniter, discourse, django, django-cms, drupal-core, keycloak, laravel, mediawiki, moodle, nextcloud, nextjs, odoo, payload, strapi, symfony, typo3, wordpress |
| `I should be logged in as "user"` | backdrop-cms, codeigniter, discourse, django, keycloak, laravel, mediawiki, moodle, nextcloud, nextjs, odoo, payload, strapi, symfony, typo3 |
| `I am not logged in` | discourse, django, django-cms, drupal-core, joomla, keycloak, nextcloud, odoo, payload, strapi, typo3, wordpress |
| `I log in as "user" with the login form` | codeigniter, discourse, django, keycloak, laravel, mediawiki, moodle, nextcloud, nextjs, payload, strapi, symfony |
| `I should see the success message "…"` | codeigniter, django, drupal-core, jira, joomla, magento, moodle, prestashop, symfony, woocommerce |
| `I should see the login form` | codeigniter, django-cms, drupal-core, joomla, laravel, moodle, nextjs, odoo, symfony, wordpress |
| `the login should be refused with "…"` | discourse, django, keycloak, mediawiki, nextcloud, payload, strapi |
| `I am on the login page` | django-cms, drupal-core, joomla, keycloak, nextcloud, odoo, wordpress |
| `I log in with the username "…" and the password "…"` | discourse, keycloak, moodle, nextcloud, symfony |
| `I should not be allowed to open "…"` | discourse, django, django-cms, payload, strapi |
| `the "…" field should have the error "…"` | craft-cms, keycloak, laravel, symfony |
| `I should be on the login page` | discourse, keycloak, nextcloud, wordpress |
| `I should see the 404 error page`, `the page should not show debug information` | codeigniter, laravel, symfony |
| `the "…" field should have no error` | keycloak, laravel, symfony |
| `I go to the login page` | django-cms, keycloak, nextcloud |
| `a page of another site sends a form to "…"` | laravel, symfony |
| `I close the browser and open it again` | keycloak |
| `my session expires` | codeigniter |
| `I press "…" with a forged token` | symfony |

None matches a webship-js step, and none matches a phrase of the component pack (Bootstrap) or of the Diffy pack,
which can be loaded beside this one.

## Testing this package

```bash
npm ci
npm run test:examples    # every step's JSDoc examples match it and nothing else; every feature step resolves
npm run test:paths       # a feature named on the command line runs alone
npx cucumber-js --dry-run
SITE_DIR="$PWD/../spring-boot-site" .github/scripts/build-ddev-site.sh
npx cucumber-js          # the whole suite of the PetClinic sample with Spring Security
npm run test:must-fail   # the assertions that must fail, each with its message and a hint
APP=new SITE_DIR="$PWD/../spring-boot-site" .github/scripts/build-ddev-site.sh
npx cucumber-js tests/new-app
SECURITY=off SPRING_BOOT_VERSION= SITE_DIR="$PWD/../spring-boot-site" .github/scripts/build-ddev-site.sh
npx cucumber-js tests/without-security
```

## How the steps were written

Every step was written from a round of manual testing of the real local apps in the browser first: each page it
touches was opened as the account the step works as, its roles, labels and messages noted, and the signal it gives
while it loads or saves found (the page load of a form, the redirect to the login page, the status of the page). The
failures of the first runs went back to the browser before the step changed: the read-only username of the generated
login page for a signed-in browser, the session a request from another site can take away, the forms without a CSRF
token.

## License

MIT, see [LICENSE](LICENSE).

## Logo

The Spring Boot logo in this README comes from Simple Icons 16.37.0 (CC0-1.0), filled with the colour the set lists
for the brand. The Spring Boot name and logo are trademarks of their owner; this pack is not affiliated with or
endorsed by them.

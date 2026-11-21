@must-fail
Feature: The session steps fail with a message that says what was found
  # Each scenario asserts something that is not true on the test site: its last step must fail with the message
  # its description names, and a hint (tests/check-must-fail.js). The scenarios only read.

  Scenario: A login that worked is not a refusal
    Fails with: Expected the login to be refused, but the browser left the login page
    Given I am on the login page
    When I log in as "user" with the login form
    Then the login should be refused with "Invalid credentials"

  Scenario: The refusal is named as the page writes it
    Fails with: The login page does not say "Bad credentials". It says: "Invalid credentials".
    Given I am on the login page
    When I log in with the username "user" and the password "Wrong-password-1"
    Then the login should be refused with "Bad credentials"

  Scenario: Another account is not the one signed in
    Fails with: Expected "administrator" (administrator) to be logged in, but the header and the navigation name "user"
    Given I am a logged in user with the "user" user
    Then I should be logged in as "administrator"

  Scenario: A visitor is not logged in
    Fails with: Expected to be logged in, but /owners/find sent the browser to the login page.
    Given I am not logged in
    Then I should be logged in

  Scenario: A signed-in account is logged in
    Fails with: Expected nobody to be logged in, but /owners/find opened without the login page
    Given I am a logged in user with the "user" user
    Then I should not be logged in

  Scenario: The home page is not the login page
    Fails with: Expected the login page (/login), but the browser shows HTTP 200 at /
    Given I am not logged in
    Then I should be on the login page

  Scenario: The home page has no login form
    Fails with: Expected to see the login form, but it did not appear
    Given I am not logged in
    Then I should see the login form

  Scenario: The home page does not ask to confirm a logout
    Fails with: Expected the page that asks to confirm the logout, but the browser shows
    Given I am a logged in user with the "user" user
    When I go to "/"
    Then I should be asked to confirm the logout

  Scenario: No page was asked for when the login was started on the login page
    Fails with: No page sent the browser to the login page in this scenario
    Given I am on the login page
    When I log in as "user" with the login form
    Then I should be back on the page I asked for

  Scenario: A visitor who sent no login form started no session by a login
    Fails with: No login form was sent in this scenario.
    Given I am not logged in
    Then the login should have started a new session

  Scenario: A login without remember-me leaves no remember-me cookie
    Fails with: The browser holds no remember-me cookie ("remember-me").
    Given I am not logged in
    When I log in as "user" with the login form
    Then the remember-me cookie should be HttpOnly

  Scenario: The remember-me cookie lasts the days the app gives it
    Fails with: The remember-me cookie "remember-me" lasts
    Given I am not logged in
    When I log in as "user" with the login form and "Remember me on this computer." checked
    Then the remember-me cookie should last 30 days

  Scenario: The session cookie is Secure
    Fails with: The session cookie "JSESSIONID" is Secure
    Given I am a logged in user with the "user" user
    Then the session cookie should not be Secure

  Scenario: A checkbox the login form does not have
    Fails with: The login form has no "Keep me signed in" checkbox. It has: "Remember me on this computer."
    Given I am on the login page
    When I log in as "user" with the login form and "Keep me signed in" checked

  Scenario: An account that is not in the users registry
    Fails with: The user "editor" is not in the users registry. Known users: administrator, user.
    Given I am a logged in user with the "editor" user

  Scenario: Another account cannot log in on the login page of a signed-in browser
    Fails with: The login page holds the signed-in account "user" in a read-only username field, so "administrator" cannot log in there.
    Given I am a logged in user with the "user" user
    When I go to the login page
    And I log in as "administrator" with the login form

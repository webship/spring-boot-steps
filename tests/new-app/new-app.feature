@new-app @js-off
Feature: A new app with a login and no page of its own
  As the developer of a new app
  I want the login pages, the role rules, the error pages and the health endpoint the framework gives every app
  So that they work before I write a single page

  # Run these features against a new app made with the official initializer, with the login added (APP=new in the
  # build script): no page and no error page of its own, so the framework's default error page answers every error,
  # and every page a signed-in account opens is that page with the status 404. The browser logs each of them, so the
  # whole feature carries @js-off.

  @critical
  Scenario: A visitor is sent to the generated login page
    Given I am not logged in
    When I go to "/"
    Then I should be on the login page
    And I should see "Please sign in"
    And I should see "Remember me on this computer."

  Scenario: After the login, the page asked for is the default error page: the app has no page of its own
    Given I am not logged in
    When I go to "/"
    And I log in as "user" with the login form
    Then I should be back on the page I asked for
    And I should see the default error page
    And the default error page should say "Not Found" with the status 404
    And the page should not show debug information

  Scenario: The access-denied answer of the USER role is the default error page with the status 403
    Given I am a logged in user with the "user" user
    When I go to "/admin/"
    Then I should see the 403 error page
    And the default error page should say "Forbidden" with the status 403

  Scenario: The ADMIN role may open the administration pages, which a new app does not have yet
    Given I am a logged in user with the "administrator" user
    Then I should be allowed to open "/admin/"
    And I should see the 404 error page
    And the default error page should say "Not Found" with the status 404

  Scenario: A login form sent with a forged token is refused before the password is looked at
    Given I am on the login page
    When I fill in "Username" with "user"
    And I fill in "Password" with "Wrong-password-1"
    And I press "Sign in" with a forged token
    Then I should see the 403 error page
    And the default error page should say "Forbidden" with the status 403

  Scenario: Logging in and out through the generated pages
    Given I am not logged in
    When I log in as "administrator" with the login form
    Then I should be logged in
    And the login should have started a new session
    When I log out
    Then I should be on the login page
    And I should see the success message "You have been signed out"
    And I should not be logged in

  Scenario: A wrong password is refused
    Given I am on the login page
    When I log in with the username "user" and the password "Wrong-password-1"
    Then the login should be refused with "Invalid credentials"

  Scenario: Remember-me outlives the browser, and takes up a session that ended
    Given I am not logged in
    When I log in as "user" with the login form and "Remember me on this computer." checked
    And I close the browser and open it again
    Then I should be logged in
    When my session expires
    Then I should be logged in

  Scenario: A session that ended, without remember-me, sends the browser to the login page
    Given I am a logged in user with the "user" user
    When my session expires
    Then I should not be logged in

  Scenario: Anybody sees whether the app is up, and the ADMIN role sees its parts
    Given I am not logged in
    Then the health endpoint should report "UP"
    And the health endpoint should show no components
    And the health group "readiness" should report "UP"
    When I log in as "administrator" with the login form
    Then the health endpoint should show the component "db"
    And the health component "db" should report "UP"

  # A new app exposes only the health endpoint of its management endpoints: the others answer 404 to the ADMIN role.
  Scenario: The other management endpoints are refused to the USER role
    Given I am a logged in user with the "user" user
    Then I should not be allowed to open "/actuator/env"
    When a program asks for "/actuator/env"
    Then the program should get the error "Forbidden" with the status 403

  Scenario: A program gets the error of a missing page as JSON, without a trace
    Given I am a logged in user with the "user" user
    When a program asks for "/no-such-page"
    Then the program should get the error "Not Found" with the status 404
    And the error answer should not carry a stack trace

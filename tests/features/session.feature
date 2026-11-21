@session
Feature: Logging in and out
  As a person who uses an app with a login
  I want the login, its refusals and the logout to work the way the framework makes them
  So that only the people with an account get in, and they can get out again

  # The test site is the PetClinic sample with Spring Security added by its build: the login and logout pages the
  # framework generates, and "Signed in as <name>" with a "Log out" button in the navigation of its pages.

  @critical
  Scenario: A visitor who opens a page that needs a session is sent to the login page
    Given I am not logged in
    When I go to "/owners/find"
    Then I should be on the login page
    And I should see the login form
    And I should see "Please sign in"

  Scenario Outline: The <account> account logs in through the login form
    Given I am not logged in
    When I log in as "<account>" with the login form
    Then I should be logged in as "<account>"
    And the login should have started a new session

    Examples:
      | account       |
      | administrator |
      | user          |

  Scenario: The page asked for before the login opens after it
    Given I am not logged in
    When I go to "/owners/find"
    And I log in as "user" with the login form
    Then I should be back on the page I asked for
    And I should see "Find Owners"

  Scenario: A login started on the login page itself goes to the home page
    Given I am on the login page
    When I log in as "user" with the login form
    Then the path should be "/"
    And I should see "Welcome"

  Scenario: A wrong password and an unknown account are refused with the same words
    Given I am on the login page
    When I log in with the username "user" and the password "Wrong-password-1"
    Then the login should be refused with "Invalid credentials"
    And I should see the error message "Invalid credentials"
    When I log in with the username "no-such-account" and the password "Wrong-password-1"
    Then the login should be refused with "Invalid credentials"
    And I should not be logged in

  # For a signed-in browser the generated login page holds the account's username in a read-only field: it only asks
  # that account for its password again.
  Scenario: The login page of a signed-in account asks for its password again
    Given I am a logged in user with the "user" user
    When I go to the login page
    Then the "Username" field should contain "user"
    When I log in as "user" with the login form
    Then I should be logged in as "user"

  Scenario: The logout button of the page ends the session
    Given I am a logged in user with the "user" user
    When I go to "/owners/find"
    And I log out
    Then I should be on the login page
    And I should see the success message "You have been signed out"
    And I should not be logged in

  # The logout page names no icon: the browser asks for /favicon.ico, a 404 for a signed-in account.
  @js-off
  Scenario: The logout page asks first, and nothing ends until its button is pressed
    Given I am a logged in user with the "administrator" user
    When I go to the logout page
    Then I should be asked to confirm the logout
    And I should see "Are you sure you want to log out?"
    When I confirm the logout
    Then I should see the success message "You have been signed out"
    And I should not be logged in

  @js-off
  Scenario: Going to the logout page alone keeps the session
    Given I am a logged in user with the "user" user
    When I go to the logout page
    Then I should be asked to confirm the logout
    And I should be logged in as "user"

  Scenario: The session cookie is out of reach of the page's scripts and sent over HTTPS only
    Given I am a logged in user with the "user" user
    Then the session cookie should be HttpOnly
    And the session cookie should be Secure

@csrf
Feature: The CSRF protection
  As the owner of an app with forms
  I want every form that sends data to carry its token, and every forged request refused
  So that another site cannot act in the name of a signed-in person

  # A refused request answers 403 on the app's own error page; the browser logs it, so those scenarios carry @js-off.

  Scenario: Every form that posts carries its token, and a form that sends with GET carries none
    Given I am a logged in user with the "administrator" user
    When I go to "/owners/1/edit"
    Then every form that posts on this page should carry a CSRF token
    And the form of the "Update Owner" button should carry a CSRF token
    And the form of the "Log out" button should carry a CSRF token
    When I go to "/owners/find"
    Then the form of the "Find Owner" button should not carry a CSRF token

  @js-off
  Scenario: A form sent with a forged token is refused, and nothing changes
    Given I am a logged in user with the "administrator" user
    When I go to "/owners/1/edit"
    And I fill in "Telephone" with "6085550000"
    And I press "Update Owner" with a forged token
    Then I should see the 403 error page
    When I go to "/owners/1"
    Then I should see "6085551023"
    And I should not see "6085550000"

  # The browser sends the session cookie of the app with a request from another site only while the cookie is new
  # (it has no SameSite of its own), and the answer can give the browser another session: log in again to look.
  @js-off
  Scenario: A form sent from a page of another site is refused
    Given I am a logged in user with the "administrator" user
    When a page of another site sends a form to "/owners/1/edit"
    Then I should see the 403 error page
    Given I am a logged in user with the "administrator" user
    When I go to "/owners/1"
    Then I should see "George Franklin"
    And I should not see "Forged"

  @js-off
  Scenario: A logout with a forged token is refused, and the session goes on
    Given I am a logged in user with the "user" user
    When I go to "/owners/find"
    And I press "Log out" with a forged token
    Then I should see the 403 error page
    And I should be logged in as "user"

  @js-off
  Scenario: A login form sent with a forged token is refused before the password is looked at
    Given I am on the login page
    When I fill in "Username" with "user"
    And I fill in "Password" with "Wrong-password-1"
    And I press "Sign in" with a forged token
    Then I should see the 403 error page
    And I should not see "Invalid credentials"

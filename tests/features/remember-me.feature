@remember-me
Feature: Remember-me and a session that ended
  As a person who comes back to an app
  I want the app to remember me when I ask it to, and only then
  So that I need not log in each time on my own computer, and nobody else is let in on a shared one

  # A session that ended is one the app no longer knows: what the app sees from a browser whose session timed out.

  Scenario: With remember-me ticked, a browser closed and opened again is still signed in
    Given I am not logged in
    When I log in as "user" with the login form and "Remember me on this computer." checked
    Then a cookie with the name "remember-me" should exist
    And the remember-me cookie should last 14 days
    And the remember-me cookie should be HttpOnly
    And the remember-me cookie should be Secure
    When I close the browser and open it again
    Then I should be logged in as "user"

  Scenario: Without remember-me, a browser closed and opened again has to log in again
    Given I am not logged in
    When I log in as "user" with the login form and "Remember me on this computer." unchecked
    Then a cookie with the name "remember-me" should not exist
    When I close the browser and open it again
    Then I should not be logged in

  Scenario: The logout takes the remember-me token away
    Given I am not logged in
    When I log in as "user" with the login form and "Remember me on this computer." checked
    And I log out
    Then a cookie with the name "remember-me" should not exist
    When I close the browser and open it again
    Then I should not be logged in

  Scenario: A session that ended sends the browser to the login page, and back to the page after the login
    Given I am a logged in user with the "user" user
    When my session expires
    And I go to "/owners/find"
    Then I should be on the login page
    When I log in as "user" with the login form
    Then I should be back on the page I asked for

  Scenario: Remember-me takes up a session that ended
    Given I am not logged in
    When I log in as "administrator" with the login form and "Remember me on this computer." checked
    And my session expires
    Then I should be logged in as "administrator"

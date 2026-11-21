@error-pages
Feature: The error pages of an app with an error page of its own
  As a person who meets an error in an app
  I want the app's own error page, with nothing of how the app is built on it
  So that the error is plain to me and tells an attacker nothing

  # The test site has its own error page (templates/error.html): "Something happened..." and a line per status.
  # The browser logs every error page it gets, so those scenarios carry @js-off.

  @js-off
  Scenario: A page that fails shows the app's own error page, with no debug information
    Given I am not logged in
    When I go to "/oups"
    Then I should see the 500 error page
    And I should not see the default error page
    And I should see "Something happened..."
    And I should see "An internal server error occurred."
    And the page should not show debug information

  @js-off
  Scenario: A missing page shows the app's own 404 page to a signed-in account
    Given I am a logged in user with the "user" user
    When I go to "/no-such-page"
    Then I should see the 404 error page
    And I should see "The requested page was not found."
    And I should not see the default error page

  Scenario: A visitor who asks for a missing page is sent to the login page
    Given I am not logged in
    When I go to "/no-such-page"
    Then I should be on the login page
    And I should not see the 404 error page

  # The browser logs the refused request of the program too.
  @js-off
  Scenario: A program gets the error as JSON, without a trace or the exception message
    Given I am not logged in
    When a program asks for "/oups"
    Then the program should get the error "Internal Server Error" with the status 500
    And the error answer should not carry a stack trace
    And the error answer should not carry the exception message

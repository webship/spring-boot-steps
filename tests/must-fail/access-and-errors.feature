@must-fail
Feature: The access, CSRF and error steps fail with a message that says what was found
  # Each scenario asserts something that is not true on the test site: its last step must fail with the message
  # its description names, and a hint (tests/check-must-fail.js). The scenarios only read.

  Scenario: A page open to the USER role is not refused
    Fails with: Expected /owners/find to be refused to this session, but it answered HTTP 200
    Given I am a logged in user with the "user" user
    Then I should not be allowed to open "/owners/find"

  @js-off
  Scenario: A page of the ADMIN role does not open for the USER role
    Fails with: Expected /owners/new to open for this session, but it answered HTTP 403.
    Given I am a logged in user with the "user" user
    Then I should be allowed to open "/owners/new"

  Scenario: A page that needs a session does not open for a visitor
    Fails with: Expected /owners/find to open for this session, but the browser was sent to the login page.
    Given I am not logged in
    Then I should be allowed to open "/owners/find"

  Scenario: A form that sends with GET carries no token
    Fails with: The form of the button "Find Owner" carries no CSRF token ("_csrf"): it sends with GET, which needs none.
    Given I am a logged in user with the "user" user
    When I go to "/owners/find"
    Then the form of the "Find Owner" button should carry a CSRF token

  Scenario: A token cannot be forged in a form that has none
    Fails with: The form of the button "Find Owner" carries no CSRF token ("_csrf").
    Given I am a logged in user with the "user" user
    When I go to "/owners/find"
    And I press "Find Owner" with a forged token

  @js-off
  Scenario: The app's own error page is not the default one
    Fails with: Expected the framework's default error page ("Whitelabel Error Page"), but the browser shows HTTP 404
    Given I am a logged in user with the "user" user
    When I go to "/no-such-page"
    Then I should see the default error page

  @js-off
  Scenario: The default error page's line is only on the default error page
    Fails with: Expected the framework's default error page, but the browser shows HTTP 500
    Given I am not logged in
    When I go to "/oups"
    Then the default error page should say "Internal Server Error" with the status 500

  @js-off
  Scenario: A missing page is not the 500 error page
    Fails with: Expected the 500 error page, but the browser shows HTTP 404
    Given I am a logged in user with the "user" user
    When I go to "/no-such-page"
    Then I should see the 500 error page

  Scenario: A visitor gets the login page, not an error page
    Fails with: Expected the 404 error page, but the browser shows HTTP 200 at /login
    Given I am not logged in
    When I go to "/no-such-page"
    Then I should see the 404 error page

  @js-off
  Scenario: A live app shows no debug information
    Fails with: Expected the page to show debug information, but it shows none
    Given I am not logged in
    When I go to "/oups"
    Then the page should show debug information

  @js-off
  Scenario: The error of a failing page is no 404
    Fails with: The program got HTTP 500 with {"status":500,"error":"Internal Server Error","path":"/oups"}, not the error "Not Found" with the status 404.
    Given I am not logged in
    When a program asks for "/oups"
    Then the program should get the error "Not Found" with the status 404

  @js-off
  Scenario: A live app's error answer carries no trace
    Fails with: The error answer for /oups carries no trace
    Given I am not logged in
    When a program asks for "/oups"
    Then the error answer should carry a stack trace

  Scenario: A redirect to the login page is no error answer
    Fails with: The program's request for /owners/find was sent on to another page
    Given I am not logged in
    When a program asks for "/owners/find"
    Then the program should get the error "Forbidden" with the status 403

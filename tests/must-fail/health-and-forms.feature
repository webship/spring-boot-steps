@must-fail
Feature: The health and form steps fail with a message that says what was found
  # Each scenario asserts something that is not true on the test site: its last step must fail with the message
  # its description names, and a hint (tests/check-must-fail.js). The scenarios only read.

  Scenario: A visitor sees no component of the health
    Fails with: The health endpoint shows no component "db" to this session. It shows: (none).
    Given I am not logged in
    Then the health endpoint should show the component "db"

  Scenario: The ADMIN role sees the components
    Fails with: The health endpoint shows this session its components:
    Given I am a logged in user with the "administrator" user
    Then the health endpoint should show no components

  # The browser logs the refused request of the program (404).
  @js-off
  Scenario: A component is not answered to a visitor
    Fails with: The health component "db" is not shown to this session (/actuator/health/db: HTTP 404).
    Given I am not logged in
    Then the health component "db" should report "UP"

  Scenario: A group the health does not have
    Fails with: The health endpoint has no group "startup". Its groups: "liveness", "readiness".
    Given I am not logged in
    Then the health group "startup" should report "UP"

  Scenario: The app is up
    Fails with: The health endpoint reports "UP", not "DOWN"
    Given I am not logged in
    Then the health endpoint should report "DOWN"

  Scenario: The build of the info endpoint is the sample's
    Fails with: The info endpoint shows "build.name" as "petclinic", not "another-app".
    Given I am not logged in
    Then the info endpoint should show "build.name" as "another-app"

  Scenario: A form not sent yet has no error
    Fails with: The "Telephone" field does not have the error "Telephone must be a 10-digit number". Its errors: (none).
    Given I am a logged in user with the "administrator" user
    When I go to "/owners/1/edit"
    Then the "Telephone" field should have the error "Telephone must be a 10-digit number"

  Scenario: A refused field has its error
    Fails with: The "First Name" field has the error "must not be blank".
    Given I am a logged in user with the "administrator" user
    When I go to "/owners/1/edit"
    And I fill in "First Name" with ""
    And I fill in "Telephone" with "12ab"
    And I press "Update Owner"
    Then the "First Name" field should have no error

  Scenario: Every refused field is in the table
    Fails with: Other fields have errors too: "Telephone" (Telephone must be a 10-digit number).
    Given I am a logged in user with the "administrator" user
    When I go to "/owners/1/edit"
    And I fill in "First Name" with ""
    And I fill in "Telephone" with "12ab"
    And I press "Update Owner"
    Then the form should show the errors:
      | First Name | must not be blank |

  Scenario: A refused form has errors
    Fails with: Fields of the page have errors: "First Name" (must not be blank)
    Given I am a logged in user with the "administrator" user
    When I go to "/owners/1/edit"
    And I fill in "First Name" with ""
    And I press "Update Owner"
    Then the form should show no errors

  # The owner page's own script hides its messages after 3 seconds and throws when one is missing.
  @js-off
  Scenario: No flash message before a save
    Fails with: The page does not show the success message "Owner Values Updated". It shows: (none).
    Given I am a logged in user with the "administrator" user
    When I go to "/owners/1"
    Then I should see the success message "Owner Values Updated"

  Scenario: A field the form does not have
    Fails with: No field "Nickname" is on the page
    Given I am a logged in user with the "administrator" user
    When I go to "/owners/1/edit"
    Then the "Nickname" field should have no error

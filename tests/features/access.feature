@access
Feature: Who may open what
  As the owner of an app with roles
  I want each page open to the accounts its rules name, and refused to the others
  So that a visitor, the USER role and the ADMIN role each see what is theirs

  # The rules of the test site: anybody opens the home page, the veterinarians and the health endpoint; a signed-in
  # account finds owners and adds visits; only the ADMIN role adds and edits owners and pets and opens the other
  # management endpoints. A refusal is the login page for a visitor and the access-denied answer (403) for an account.

  Scenario: A visitor opens the pages open to anybody, and is sent to the login page for the others
    Given I am not logged in
    Then I should be allowed to open "/"
    And I should be allowed to open "/vets.html"
    And I should not be allowed to open "/owners/find"
    And I should not be allowed to open "/owners/1"

  @js-off
  Scenario: The USER role finds owners and adds visits, but may not add or edit an owner
    Given I am a logged in user with the "user" user
    Then I should be allowed to open "/owners/find"
    And I should be allowed to open "/owners/1/pets/1/visits/new"
    And I should not be allowed to open "/owners/new"
    And I should not be allowed to open "/owners/1/edit"
    And I should not be allowed to open "/owners/1/pets/1/edit"

  @js-off
  Scenario: The access-denied answer is the app's own error page with the status 403
    Given I am a logged in user with the "user" user
    When I go to "/owners/new"
    Then I should see the 403 error page
    And I should not see the default error page
    And I should see "Something happened..."
    And I should be logged in as "user"

  Scenario: The ADMIN role adds and edits owners and pets
    Given I am a logged in user with the "administrator" user
    Then I should be allowed to open "/owners/new"
    And I should be allowed to open "/owners/1/edit"
    And I should be allowed to open "/owners/1/pets/1/edit"

  Scenario: A visitor is sent to the login page for a management endpoint
    Given I am not logged in
    Then I should not be allowed to open "/actuator/env"

  @js-off
  Scenario: The USER role is refused a management endpoint, and the ADMIN role opens it
    Given I am a logged in user with the "user" user
    Then I should not be allowed to open "/actuator/env"
    When I log out
    And I log in as "administrator" with the login form
    Then I should be allowed to open "/actuator/env"

  # The browser logs the refused request of the program too.
  @js-off
  Scenario: A program gets the access-denied answer as JSON
    Given I am a logged in user with the "user" user
    When a program asks for "/actuator/env"
    Then the program should get the error "Forbidden" with the status 403

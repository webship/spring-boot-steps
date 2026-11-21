@without-security
Feature: The sample as it is, without a login
  As a person who uses an app without a login
  I want its own error pages and the validation messages of its forms
  So that what the framework gives every app works whether the app has a login or not

  # Run these features against the PetClinic sample unchanged, at its own release of the framework (SECURITY=off and
  # an empty SPRING_BOOT_VERSION in the build script). The browser logs every error page it gets: those scenarios
  # carry @js-off. The scenarios leave the data as they found it.

  @js-off
  Scenario: A page that fails shows the app's own error page, with no debug information
    Given I am not logged in
    When I go to "/oups"
    Then I should see the 500 error page
    And I should not see the default error page
    And I should see "Something happened..."
    And the page should not show debug information

  @js-off
  Scenario: A missing page shows the app's own 404 page to anybody
    Given I am not logged in
    When I go to "/no-such-page"
    Then I should see the 404 error page
    And I should see "The requested page was not found."
    And I should not see the default error page

  @js-off
  Scenario: An app without a login has no login page
    Given I am not logged in
    When I go to "/login"
    Then I should see the 404 error page
    And I should not see the login form

  Scenario: Anybody opens every page
    Given I am not logged in
    Then I should be allowed to open "/owners/find"
    And I should be allowed to open "/owners/1/edit"
    And I should be allowed to open "/owners/1/pets/1/edit"

  Scenario: A form posts without a token when the app has no protection
    Given I am not logged in
    When I go to "/owners/1/edit"
    Then the form of the "Update Owner" button should not carry a CSRF token

  Scenario: A refused owner form says what is wrong with each field
    Given I am not logged in
    When I go to "/owners/1/edit"
    And I fill in "First Name" with ""
    And I fill in "Telephone" with "12ab"
    And I press "Update Owner"
    Then the form should show the errors:
      | First Name | must not be blank                   |
      | Telephone  | Telephone must be a 10-digit number |
    And the "City" field should have no error

  Scenario: A saved form shows its flash message once
    Given I am not logged in
    When I go to "/owners/1/edit"
    And I fill in "City" with "Madison"
    And I press "Update Owner"
    Then I should see the success message "Owner Values Updated"
    When I reload the page
    Then I should not see the success message "Owner Values Updated"

  Scenario: The pet form refuses a name already in use and a birth date in the future
    Given I am not logged in
    When I go to "/owners/1/pets/new"
    And I fill in "Name" with "Leo"
    And I fill in "Birth Date" with "2099-01-01"
    And I press "Add Pet"
    Then the "Name" field should have the error "is already in use"
    And the "Birth Date" field should have the error "invalid date"

  Scenario: The health endpoint tells anybody that the app is up, and nothing more
    Given I am not logged in
    Then the health endpoint should report "UP"
    And the health endpoint should show no components
    And the info endpoint should show "build.name" as "petclinic"

  @js-off
  Scenario: A program gets the error as JSON, without a trace or the exception message
    Given I am not logged in
    When a program asks for "/oups"
    Then the program should get the error "Internal Server Error" with the status 500
    And the error answer should not carry a stack trace
    And the error answer should not carry the exception message

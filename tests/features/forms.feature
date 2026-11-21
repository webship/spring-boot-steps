@forms
Feature: Server-rendered forms and their messages
  As a person who fills in a form of the app
  I want each refused value explained next to its field, and a saved form confirmed once
  So that I know what to change, and that it was saved

  # The forms of the test site check their values with the constraints of their objects and print each message
  # next to its field; a saved form redirects and shows a flash message on the next page only. The scenarios leave
  # the data as they found it.

  Scenario: A refused owner form says what is wrong with each field
    Given I am a logged in user with the "administrator" user
    When I go to "/owners/1/edit"
    And I fill in "First Name" with ""
    And I fill in "Telephone" with "12ab"
    And I press "Update Owner"
    Then the form should show the errors:
      | First Name | must not be blank                   |
      | Telephone  | Telephone must be a 10-digit number |
    And the "Last Name" field should have no error
    And the "Telephone" field should have the error "Telephone must be a 10-digit number"

  Scenario: A saved form shows its flash message once
    Given I am a logged in user with the "administrator" user
    When I go to "/owners/1/edit"
    And I fill in "City" with "Madison"
    And I press "Update Owner"
    Then I should see the success message "Owner Values Updated"
    When I reload the page
    Then I should not see the success message "Owner Values Updated"

  Scenario: The pet form refuses a name already in use and a birth date in the future
    Given I am a logged in user with the "administrator" user
    When I go to "/owners/1/pets/new"
    And I fill in "Name" with "Leo"
    And I fill in "Birth Date" with "2099-01-01"
    And I press "Add Pet"
    Then the "Name" field should have the error "is already in use"
    And the "Birth Date" field should have the error "invalid date"

  Scenario: The visit form of the USER role refuses an empty description
    Given I am a logged in user with the "user" user
    When I go to "/owners/1/pets/1/visits/new"
    And I press "Add Visit"
    Then the "Description" field should have the error "must not be blank"
    And the "Date" field should have no error
    And the "Description" field should not have the error "is already in use"

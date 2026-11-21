@health
Feature: The health endpoint
  As the person who runs the app
  I want anybody to see whether the app is up, and only an administrator to see its parts
  So that a monitor can ask it, and nobody else learns how the app is built

  Scenario: Anybody may ask whether the app is up, and sees its status only
    Given I am not logged in
    Then the health endpoint should report "UP"
    And the health endpoint should show no components
    And the health group "liveness" should report "UP"
    And the health group "readiness" should report "UP"

  Scenario: The USER role sees the status only too
    Given I am a logged in user with the "user" user
    Then the health endpoint should report "UP"
    And the health endpoint should not show the component "db"

  Scenario: The ADMIN role sees the components of the health
    Given I am a logged in user with the "administrator" user
    Then the health endpoint should report "UP"
    And the health endpoint should show the component "db"
    And the health endpoint should show the component "diskSpace"
    And the health component "db" should report "UP"

  Scenario: The info endpoint tells which build runs
    Given I am not logged in
    Then the info endpoint should show "build.name" as "petclinic"
    And the info endpoint should show "build.java.source" as "17"

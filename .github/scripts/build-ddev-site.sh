#!/usr/bin/env bash
# Builds the site the suite runs against, in a DDEV project: a Spring Boot app at the current Spring Boot release,
# built with its own Maven wrapper and run as a production jar by the project's web container, on the current
# long-term-support JDK, with Spring Security added by this build (form login with the generated login and logout
# pages, remember-me, the role rules, in-memory accounts named after their roles):
#
#   APP=petclinic  the Spring PetClinic sample (Apache-2.0, github.com/spring-projects/spring-petclinic): owners,
#                  pets, visits and veterinarians, server-rendered forms with validation, its own error page;
#   APP=new        a new app made with Spring Initializr (start.spring.io), the official way to start one: web,
#                  Thymeleaf, validation, the management endpoints, JPA with an in-memory database; no page of its
#                  own, so its errors get the framework's default error page.
#
#   - https://<project>.ddev.site/   the app (the router of the container tool sends the project's address to the
#                                     app's port, 8080);
#   - /login, /logout                 the login and logout pages Spring Security generates;
#   - /actuator/health                the health endpoint (its details for the ADMIN role only).
#
# The JDK is Eclipse Temurin's (GPL-2.0 with the Classpath Exception), copied from its official image into the web
# image: no Java on the machine. Maven keeps its downloads in the project (.m2/; a build again in the same folder
# reuses them, removing the folder removes them). The database is the app's own in-memory one (H2): every start of
# the app begins with the app's data.
#
# Settings (environment variables, all optional):
#   PROJECT_NAME          the DDEV project name                                 (default springbootsteps)
#   SITE_DIR              the project folder                                    (default a new temporary folder)
#   APP                   petclinic or new (see above)                          (default petclinic)
#   SPRING_BOOT_VERSION   the Spring Boot release of the app (the parent POM); empty keeps the sample's own, or
#                         takes Spring Initializr's default for a new app       (default 4.2.0)
#   PETCLINIC_REF         the commit of the sample                              (default the one this pack was proven on)
#   JAVA_VERSION          the JDK, a major release of Eclipse Temurin           (default 25)
#   SECURITY              on: add Spring Security and the accounts; off: the app as it is, unchanged
#                                                                               (default on)
#   ACCOUNT_PASSWORD      the password of the accounts below                   (default dD.123123ddd)
#   ACCOUNTS_ONLY         1: build nothing, write the accounts of the app in SITE_DIR again and restart it
#
# The accounts are configuration: this script writes them and cucumber.js names them; the features never create
# or delete one.
#   administrator  the ADMIN role: adds and edits owners and pets, the other management endpoints, the health details
#   user           the USER role: finds owners and adds visits
#
# No hosted service, no account anywhere, nothing that is not open source.
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-springbootsteps}"
APP="${APP:-petclinic}"
SPRING_BOOT_VERSION="${SPRING_BOOT_VERSION-4.2.0}"
PETCLINIC_REF="${PETCLINIC_REF:-500158f732419217507c7656904b8e6aa1bcc0d6}"
JAVA_VERSION="${JAVA_VERSION:-25}"
SECURITY="${SECURITY:-on}"
ACCOUNT_PASSWORD="${ACCOUNT_PASSWORD:-dD.123123ddd}"
SITE_DIR="${SITE_DIR:-$(mktemp -d)}"
PACK_SITE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../site" && pwd)"
HOST="${PROJECT_NAME}.ddev.site"
APP_URL="https://${HOST}"
ROOT="/var/www/html"

case "$SECURITY" in on|off) ;; *) echo "SECURITY is on or off, not ${SECURITY}." >&2; exit 1 ;; esac
case "$APP" in petclinic|new) ;; *) echo "APP is petclinic or new, not ${APP}." >&2; exit 1 ;; esac

# A bcrypt hash of a password, made by PHP in the web container from its standard input (no password on a
# command line), in the form Spring Security's delegating password encoder reads.
hash_password() {
  printf '%s' "$1" | ddev exec "php -r 'echo password_hash(stream_get_contents(STDIN), PASSWORD_BCRYPT);'" | tr -d '\r\n' | sed 's/^/{bcrypt}/'
}

# The accounts of the app: config/accounts.properties, which config/application.properties imports.
write_accounts() {
  local admin_hash user_hash
  admin_hash="$(hash_password "$ACCOUNT_PASSWORD")"
  user_hash="$(hash_password "$ACCOUNT_PASSWORD")"
  case "$admin_hash$user_hash" in *'{bcrypt}$2'*'{bcrypt}$2'*) ;; *) echo "The password hashes could not be made in the web container." >&2; exit 1 ;; esac
  cat > app/config/accounts.properties <<PROPEOF
# The accounts of the test app: in-memory accounts named after their roles (the security configuration
# reads them at the app's start). Written by the build script of the step pack; build again with
# ACCOUNTS_ONLY=1 rather than editing by hand.
app.accounts=administrator,user
app.account.administrator.password=${admin_hash}
app.account.administrator.roles=ADMIN
app.account.user.password=${user_hash}
app.account.user.roles=USER
PROPEOF
}

# Wait until the app says it is up (its health endpoint, from inside the web container).
wait_for_app() {
  local attempt
  for attempt in $(seq 1 150); do
    if ddev exec "curl -fsS http://127.0.0.1:8080/actuator/health" < /dev/null 2>/dev/null | grep -q '"status":"UP"'; then
      return 0
    fi
    sleep 2
  done
  echo "The app did not come up; the end of the web container's log:" >&2
  ddev logs --tail 80 < /dev/null >&2 || true
  return 1
}

restart_app() {
  ddev exec "supervisorctl restart webextradaemons:spring-boot" < /dev/null > /dev/null
}

mkdir -p "$SITE_DIR"
cd "$SITE_DIR"

if [ "${ACCOUNTS_ONLY:-}" = "1" ]; then
  write_accounts
  restart_app
  wait_for_app
  echo "The accounts of ${APP_URL} are written again (administrator, user), and the app has restarted."
  exit 0
fi

# A project of this name from an earlier build goes first, with its containers.
if ddev describe "$PROJECT_NAME" > /dev/null 2>&1; then
  ddev delete -Oy "$PROJECT_NAME" < /dev/null
fi
# The Maven downloads of an earlier build in this folder (.m2/) are kept.
rm -rf app app.jar app.zip

# The app, then what this build adds to it.
if [ "$APP" = "petclinic" ]; then
  echo "Fetching the PetClinic sample (${PETCLINIC_REF})."
  git init -q app
  git -C app fetch -q --depth 1 https://github.com/spring-projects/spring-petclinic.git "$PETCLINIC_REF"
  git -C app checkout -q FETCH_HEAD
  BOOT_OF_PREPARE="$SPRING_BOOT_VERSION"
else
  echo "Making a new app with Spring Initializr (start.spring.io)."
  DEPENDENCIES="web,thymeleaf,validation,actuator,data-jpa,h2"
  [ "$SECURITY" = "on" ] && DEPENDENCIES="${DEPENDENCIES},security"
  curl -fsSL -o app.zip "https://start.spring.io/starter.zip?type=maven-project&language=java${SPRING_BOOT_VERSION:+&bootVersion=${SPRING_BOOT_VERSION}}&baseDir=app&groupId=com.example&artifactId=demo&name=demo&description=A%20new%20app&packageName=com.example.demo&javaVersion=${JAVA_VERSION}&dependencies=${DEPENDENCIES}"
  unzip -q app.zip && rm -f app.zip
  BOOT_OF_PREPARE=""
fi
python3 "${PACK_SITE}/prepare-app.py" app --boot-version "$BOOT_OF_PREPARE" --security "$SECURITY"

# A generic project: the web container runs the app's jar as a daemon and the router sends the project's
# address to its port; no database of the container tool's own (the sample keeps its data in memory),
# Node.js 24 for a test suite run in the web container.
ddev config --project-type=generic --webserver-type=generic --docroot=app --project-name="$PROJECT_NAME" \
  --omit-containers=db --nodejs-version=24 < /dev/null

mkdir -p .ddev/web-build app/config
cat > .ddev/config.spring-boot.yaml <<YAMLEOF
# Spring Boot in this project. Written by the build script of the step pack; build again rather than
# editing by hand. The web container serves no files of its own: the router sends ports 80 and 443 of the
# project's address to the app, which the web container runs as a daemon once its jar is built (app.jar).
# Maven keeps its downloads in the project (.m2/).
web_extra_exposed_ports:
  - name: spring-boot
    container_port: 8080
    http_port: 80
    https_port: 443
web_extra_daemons:
  - name: spring-boot
    command: "bash -c 'while [ ! -f ${ROOT}/app.jar ]; do sleep 2; done; exec java -Xms128m -Xmx512m -jar ${ROOT}/app.jar'"
    directory: ${ROOT}/app
web_environment:
  - MAVEN_USER_HOME=${ROOT}/.m2
  - MAVEN_OPTS=-Dmaven.repo.local=${ROOT}/.m2/repository
YAMLEOF
cat > .ddev/web-build/Dockerfile.spring-boot <<DOCKEREOF
# The JDK of the app: Eclipse Temurin ${JAVA_VERSION}, copied from its official image. Written by the build
# script of the step pack.
COPY --from=eclipse-temurin:${JAVA_VERSION}-jdk /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
RUN for tool in java javac jar jshell; do ln -sf /opt/java/openjdk/bin/\$tool /usr/local/bin/\$tool; done && java -version
DOCKEREOF

# How the app runs here: behind the router's HTTPS (its forwarded headers give the address the browser
# uses), and, with Spring Security, the health details for the ADMIN role, the key of remember-me, the
# accounts and, for the sample, which of its pages anybody may open and which only the ADMIN role.
{
  echo "# The settings of the test app's run in this project. Written by the build script of the step pack."
  echo "server.forward-headers-strategy=native"
  if [ "$SECURITY" = "on" ]; then
    if [ "$APP" = "petclinic" ]; then
      echo "app.security.public-paths=/,/resources/**,/webjars/**,/error,/oups,/vets,/vets.html,/actuator/health,/actuator/health/**,/actuator/info"
      echo "app.security.admin-paths=/owners/new,/owners/*/edit,/owners/*/pets/new,/owners/*/pets/*/edit,/actuator/**"
    fi
    echo "management.endpoint.health.show-details=when-authorized"
    echo "management.endpoint.health.roles=ADMIN"
    echo "app.remember-me.key=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
    echo "spring.config.import=optional:file:./config/accounts.properties"
  fi
} > app/config/application.properties

ddev start -y < /dev/null
ddev exec "java -version" < /dev/null
if [ "$SECURITY" = "on" ]; then
  write_accounts
fi

echo "Building the app with its own Maven wrapper (the first build downloads Maven and the app's libraries)."
ddev exec -d "${ROOT}/app" "./mvnw -B -ntp -Dmaven.repo.local=${ROOT}/.m2/repository -DskipTests -Dcheckstyle.skip=true -Dspring-javaformat.skip=true -Djacoco.skip=true package" < /dev/null
ddev exec "cp \"\$(ls ${ROOT}/app/target/*.jar | head -n 1)\" ${ROOT}/app.jar" < /dev/null
echo "Waiting for the app."
wait_for_app

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "LAUNCH_URL=$APP_URL" >> "$GITHUB_ENV"
fi
BOOT="$(ddev exec "unzip -p ${ROOT}/app.jar META-INF/MANIFEST.MF" < /dev/null | sed -n 's/^Spring-Boot-Version: *//p' | tr -d '\r')"
# sed reads the whole output (a head that stops early would cut the pipe of the container tool under pipefail).
JAVA="$(ddev exec "java -version 2>&1" < /dev/null | tr -d '\r' | sed -n '1p')"
[ "$APP" = "petclinic" ] && WHAT="the PetClinic sample" || WHAT="a new app from Spring Initializr"
echo "Built ${WHAT} on Spring Boot ${BOOT} (${JAVA}) at ${APP_URL}: security ${SECURITY}."

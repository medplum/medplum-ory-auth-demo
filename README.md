# Medplum and Ory Hydra Auth Demo

> [!WARNING]  
> This repository is under active development, and only works with a pre-release version of Medplum.
> See https://github.com/medplum/medplum/issues/6355 for details.

This repository contains a minimal, self-contained demonstration of how to use [Ory Hydra](https://www.ory.sh/docs/hydra) as an external OIDC authentication provider for a [Medplum](https://www.medplum.com/) server.

The goal is to show the complete end-to-end authentication flow, from a user initiating a login in a client application to that application receiving an access token with custom `fhirUser` claims, ready to be used against a Medplum API.

This demo intentionally avoids using Ory Kratos to show the fundamental integration pattern required by Hydra: a separate **Identity Provider** service that handles the login and consent flows.

## Core Components

This demo consists of two small Express.js applications:

1.  **`mini-idp.mjs` (The Identity Provider)**
    This application acts as a mock Identity Provider. It has no UI. Its sole purpose is to handle requests from Ory Hydra and automatically approve them for a hardcoded test user.

    - Implements a `/login` endpoint to automatically tell Hydra the user is authenticated.
    - Implements a `/consent` endpoint to automatically approve permissions and inject custom claims (`fhirUser` and `profile`) into the token.

2.  **`test-app.mjs` (The Client Application)**
    This application simulates a real web app that a user would interact with.
    - On startup, it automatically creates a new OAuth2 client in Hydra via its admin API.
    - Renders a home page with a "Log In" link that starts the OIDC flow.
    - Implements a `/callback` endpoint to handle the redirect from Hydra, exchange the authorization code for an access token, and display the results.
    - Includes a button to demonstrate using the received access token to make an API call.

### How it Works

See the sequence diagram below for a visual representation of the authentication flow:

![Sequence diagram of the auth flow](/sequence-diagram.png)

## Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) and Docker Compose
- [Node.js](https://nodejs.org/) (v18 or later)

## Running the Demo

#### 1. Configuring Medplum Server
To use external authentication, the `medplum.config.json` used to configure medplum server needs another configuration paramter. 

For this demo, add the following, then restart medplum server:

``` js
"externalAuthProviders": [
  {
    "issuer": "http://127.0.0.1:4444",
    "userInfoUrl": "http://127.0.0.1:4444/userinfo"
  }
]
```

#### 2. Configuring a login user in Medplum

The external authentication works with previously created users in Medplum that have a practitioner profile and a specific identifier attached to the practitioner resource. 

Add the following identifier to a `Practitioner` resource associated with a `User` login account 

``` json
"identifier": [
  {
    "system": "npi",
    "value": "1234"
  }
]
```

#### 3. Start Ory Hydra

This is an abbreviated version of the [Ory Hydra OAuth2 Server Quickstart](https://www.ory.sh/docs/hydra/self-hosted/quickstart).

Clone the Ory Hydra locally:

```bash
git clone https://github.com/ory/hydra.git
cd hydra
git checkout v2.3.0
```

Copy the `quickstart-medplum.yml` overrides file from this repository into the Hydra directory:

```bash
cp ../quickstart-medplum.yml .
```

Then, start the Ory Hydra service using the official quickstart configuration.

```bash
docker compose -f quickstart.yml -f quickstart-medplum.yml up --build
```

#### 4. Clone and install this Repository

In a separate terminal window, clone this repository and install the dependencies:

```bash
git clone https://github.com/medplum/medplum-ory-hydra-demo.git
cd medplum-ory-hydra-demo
npm install
```

#### 5. Start the Mini-IDP

The Mini-IDP acts as the user database and must be running for Hydra to use it.

```bash
# In your second terminal window, from this project's root
node mini-idp.mjs
```

> You should see the message: `Auto-Login/Consent App running on http://localhost:6001`

#### 6. Start the Test App

Finally, start the client application. It will automatically register itself with Hydra.

```bash
# In your third terminal window, from this project's root
node test-app.mjs
```

> You should see the message: `✅ Test App running on http://127.0.0.1:8080`

#### 7. Run the Flow

You are now ready to test the entire flow:

1.  Open your web browser and navigate to **`http://127.0.0.1:8080`**.
2.  Click the **"Click here to Log In"** link.
3.  Your browser will flash as it is instantly redirected through the entire OIDC flow (Hydra -> Mini-IDP Login -> Hydra -> Mini-IDP Consent -> Hydra).
4.  You will land on the success page, displaying the `access_token` and `id_token`. The ID token will contain the custom `fhirUser` claim.
5.  Click the **"Call GET /fhir/R4/Patient"** button to see a demonstration of the access token being used in a real API call. Check your browser's developer console for the output.

/*
 * This is a minimal test application to demonstrate the OIDC flow with Ory Hydra.
 * It dynamically creates an OAuth2 client in Hydra and handles the login and consent flows.
 * It also includes a button to call the Medplum API using the access token.
 */

import express from "express";

const app = express();
const PORT = 8080;

const HYDRA_CONFIG = {
  publicUrl: "http://127.0.0.1:4444",
  adminUrl: "http://127.0.0.1:4445",
  scope: "openid profile offline fhirUser",
  callbackUrl: `http://127.0.0.1:${PORT}/callback`,
  clientId: null, // To be filled in at startup
  clientSecret: null, // To be filled in at startup
};

/**
 * An async function to create the client and start the server.
 * This runs once when the application starts.
 */
async function startServer() {
  try {
    console.log("Attempting to create a new OAuth2 client in Ory Hydra...");

    const clientCreationUrl = new URL(`${HYDRA_CONFIG.adminUrl}/admin/clients`);
    const response = await fetch(clientCreationUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: `My Test App (dynamic @ ${new Date().toISOString()})`,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code", "id_token"],
        scope: HYDRA_CONFIG.scope,
        redirect_uris: [HYDRA_CONFIG.callbackUrl],
        token_endpoint_auth_method: "client_secret_post",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Failed to create client: ${response.statusText} - ${errorBody}`
      );
    }

    const client = await response.json();

    // Store the credentials from the response in our config object
    HYDRA_CONFIG.clientId = client.client_id;
    HYDRA_CONFIG.clientSecret = client.client_secret;

    console.log("✅ OAuth2 client created successfully!");
    console.log(`   Client ID: ${HYDRA_CONFIG.clientId}`);

    // NOW we can start the server, since we have our config.
    app.listen(PORT, () => {
      console.log(`✅ Test App running on http://127.0.0.1:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Could not start server.");
    console.error(error.message);
    process.exit(1); // Exit if we can't create the client
  }
}

app.get("/", (req, res) => {
  const authUrl = new URL(`${HYDRA_CONFIG.publicUrl}/oauth2/auth`);
  authUrl.searchParams.set("client_id", HYDRA_CONFIG.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", HYDRA_CONFIG.scope);
  authUrl.searchParams.set("redirect_uri", HYDRA_CONFIG.callbackUrl);
  authUrl.searchParams.set("state", "some-random-state-string");
  authUrl.searchParams.set("nonce", "another-random-nonce-string");
  res.send(
    `<h1>Test App (Client: ${
      HYDRA_CONFIG.clientId
    })</h1><p>This is a minimal client application to test the OIDC flow.</p><a href="${authUrl.toString()}">Click here to Log In</a>`
  );
});

app.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).send("Error: No authorization code received.");
  }
  try {
    const tokenUrl = new URL(`${HYDRA_CONFIG.publicUrl}/oauth2/token`);
    const response = await fetch(tokenUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: HYDRA_CONFIG.callbackUrl,
        client_id: HYDRA_CONFIG.clientId,
        client_secret: HYDRA_CONFIG.clientSecret,
      }),
    });
    if (!response.ok) {
      throw new Error(`Token exchange failed: ${await response.text()}`);
    }
    const tokens = await response.json();
    res.send(`
      <html>
        <head>
          <title>OIDC Test App - Success</title>
          <style>
            body { font-family: sans-serif; line-height: 1.5; padding: 0 2em; }
            h1, h2 { border-bottom: 1px solid #ccc; padding-bottom: 5px; }
            pre { white-space: pre-wrap; word-wrap: break-word; background: #eee; padding: 10px; border-radius: 5px; }
            button { font-size: 1em; padding: 10px 15px; cursor: pointer; border-radius: 5px; border: 1px solid #999; }
            code { background: #eee; padding: 2px 4px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <h1>Success!</h1>
          <p>Client ID: <code>${HYDRA_CONFIG.clientId}</code></p>
          <h2>Access Token</h2>
          <pre>${tokens.access_token}</pre>
          <h2>ID Token</h2>
          <pre>${tokens.id_token}</pre>
          <hr>
          <h2>Test Medplum API Call</h2>
          <p>Click the button below to use the Access Token to call <code>http://localhost:8103/fhir/R4/Patient</code>.</p>
          <p><i>(Check your browser's developer console for output)</i></p>
          <button onclick="callMedplumApi()">Call GET /fhir/R4/Patient</button>
          <br><br>
          <a href="/">Start Over</a>

          <script>
            // The access token is injected directly from the server-side variable.
            // Using JSON.stringify ensures it's correctly escaped for JavaScript.
            const accessToken = ${JSON.stringify(tokens.access_token)};

            async function callMedplumApi() {
              const medplumApiUrl = 'http://localhost:8103/fhir/R4/Patient';
              console.log('Attempting to call Medplum API at:', medplumApiUrl);
              console.log('Using Access Token:', accessToken.substring(0, 20) + '...');

              try {
                const response = await fetch(medplumApiUrl, {
                  method: 'GET',
                  headers: {
                    'Authorization': \`Bearer \${accessToken}\`
                  },
                  mode: 'cors' // This is important for cross-origin requests
                });

                console.log('Response status:', response.status, response.statusText);

                if (response.ok) {
                  const data = await response.json();
                  console.log('✅ Success! Received data:', data);
                  alert('Successfully called Medplum API! Check the developer console for the response.');
                } else {
                  const errorText = await response.text();
                  console.error('❌ Failed to call Medplum API. Response body:', errorText);
                  alert(\`Error calling Medplum API: \${response.status} \${response.statusText}. Check console for details.\`);
                }
              } catch (error) {
                console.error('❌ A network error occurred:', error);
                alert('A network error occurred. Is the Medplum server running on port 8103 and allowing CORS?');
              }
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send(`An error occurred: ${error.message}`);
  }
});

startServer();

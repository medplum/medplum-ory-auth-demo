/*
 * Mini IDP for Hydra
 * This is a simple Identity Provider that automatically approves login and consent requests
 */

import express from "express";

const app = express();
const PORT = 6001;
const HYDRA_ADMIN_URL = "http://127.0.0.1:4445";

const AUTO_LOGIN_USER = {
  subject: "test-user-subject-id",
  claims: {
    fhirUser: "Practitioner?identifier=npi|1234",
  },
};

async function acceptLoginRequest(challenge, body) {
  const url = `${HYDRA_ADMIN_URL}/admin/oauth2/auth/requests/login/accept?login_challenge=${challenge}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Failed to accept login request: ${response.statusText}`);
  return response.json();
}

async function getConsentRequest(challenge) {
  const url = `${HYDRA_ADMIN_URL}/admin/oauth2/auth/requests/consent?consent_challenge=${challenge}`;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Failed to get consent request: ${response.statusText}`);
  return response.json();
}

async function acceptConsentRequest(challenge, body) {
  const url = `${HYDRA_ADMIN_URL}/admin/oauth2/auth/requests/consent/accept?consent_challenge=${challenge}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Failed to accept consent request: ${response.statusText}`);
  return response.json();
}

/**
 * The Login Endpoint (No UI)
 * Hydra redirects here with a login_challenge. We immediately approve it.
 */
app.get("/login", async (req, res) => {
  const challenge = req.query.login_challenge;
  console.log("Login url", req.url);
  console.log(`Received login challenge: ${challenge}`);

  try {
    const loginDetails = await acceptLoginRequest(challenge, {
      subject: AUTO_LOGIN_USER.subject,
      remember: true, // Optional: tell Hydra to remember this login for a while
    });
    console.log(JSON.stringify(loginDetails, null, 2));
    // const acceptLoginResponse = loginDetails.data;

    console.log(
      `Login accepted for subject: ${AUTO_LOGIN_USER.subject}. Redirecting...`
    );
    res.redirect(loginDetails.redirect_to);
  } catch (error) {
    console.error(
      "Failed to accept login request:",
      error.response?.data || error.message
    );
    res.status(500).send("Failed to process login.");
  }
});

/**
 * The Consent Endpoint (No UI)
 * Hydra redirects here with a consent_challenge. We immediately approve it
 * and inject our custom claims.
 */
app.get("/consent", async (req, res) => {
  const challenge = req.query.consent_challenge;
  console.log(`Received consent challenge: ${challenge}`);

  try {
    const consentRequest = await getConsentRequest(challenge);

    const acceptConsentResponse = await acceptConsentRequest(challenge, {
      grant_scope: consentRequest.requested_scope,
      grant_access_token_audience:
        consentRequest.requested_access_token_audience,
      session: {
        id_token: AUTO_LOGIN_USER.claims,
        access_token: {
          // You can also add claims to the access token if it's a JWT
          ...AUTO_LOGIN_USER.claims,
        },
      },
    });

    console.log(`Consent accepted with custom claims. Redirecting...`);
    res.redirect(acceptConsentResponse.redirect_to);
  } catch (error) {
    console.error(
      "Failed to accept consent request:",
      error.response?.data || error.message
    );
    res.status(500).send("Failed to process consent.");
  }
});

app.listen(PORT, () => {
  console.log(`Auto-Login/Consent App running on http://localhost:${PORT}`);
});

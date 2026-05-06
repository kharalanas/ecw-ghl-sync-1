const express = require("express");
const axios = require("axios");
const { importJWK, exportPKCS8 } = require("jose");

const app = express();
app.use(express.json());

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
  CLIENT_ID: "mNthIYkJe0qV65nnUdhUkWVQrHENLixq1uu8kEpZdQE",
  TOKEN_URL: "https://staging-fhir.ecwcloud.com/oauth2/token",
  FHIR_BASE: "https://staging-fhir.ecwcloud.com/fhir/r4/FFBJCD",
  GHL_WEBHOOK:
    "https://services.leadconnectorhq.com/hooks/bxce7bnn4u01mHjoq1sm/webhook-trigger/fe032fe5-cc42-4030-bb65-bfd48fe54e2b",
  KEY_ID: "totalflow-key-1",
};

// ============================================================
// YOUR JWK KEY (FIXED INPUT)
// ============================================================
const JWK_KEY = {
  kty: "RSA",
  e: "AQAB",
  use: "sig",
  kid: "totalflow-key-1",
  alg: "PS384",
  n: "kGHFqDXt-EXPRQAt5cKbjF9N7TULdHxqtoko_-EtnmODcrKu66nT-8lz5Cy23RGk_Is6SsT_skY-Fz8ycvwf10pTfYAX2R7BoHPvwbeHwpTBJaFiSiSKLR9-5Ro5iIdtOOeWjsqs1ffgwFaDjSH12tqYV-zzJzOvBopH-APrgCwNbuRsJhvcn1orGMnRmYZINnXeLT-2qV-vk2txeQFp9otUp7D8qrlEPjr3RlDKHyTk4DHrYVwymyFNZKDh28LfSnDHjC_efkRhYpZeSzk3jhGb6GhOCt3r73Yt9UtfePR6qT6YkZYm4eaNID_n5suA0bWVmhDZrG_k_x8EwtPvvw",
};

// ============================================================
// PEM CACHE (IMPORTANT)
// ============================================================
let PRIVATE_KEY_PEM = null;

// convert JWK → PEM once
async function getPrivateKey() {
  if (PRIVATE_KEY_PEM) return PRIVATE_KEY_PEM;

  const key = await importJWK(JWK_KEY, "PS384");
  PRIVATE_KEY_PEM = await exportPKCS8(key);

  return PRIVATE_KEY_PEM;
}

// ============================================================
// JWT GENERATION (FIXED)
// ============================================================
const jwt = require("jsonwebtoken");

async function generateJWT() {
  const privateKey = await getPrivateKey();

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iss: CONFIG.CLIENT_ID,
      sub: CONFIG.CLIENT_ID,
      aud: CONFIG.TOKEN_URL,
      iat: now,
      exp: now + 300,
      jti: `jwt-${Date.now()}`,
    },
    privateKey,
    {
      algorithm: "PS384",
      keyid: CONFIG.KEY_ID,
    }
  );
}

// ============================================================
// ACCESS TOKEN
// ============================================================
async function getAccessToken() {
  const clientAssertion = await generateJWT();

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion,
  });

  const res = await axios.post(CONFIG.TOKEN_URL, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return res.data.access_token;
}

// ============================================================
// FHIR FETCH
// ============================================================
async function fetchFHIR(token, resource, query = "") {
  try {
    const url = `${CONFIG.FHIR_BASE}/${resource}${
      query ? "?" + query : ""
    }`;

    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/fhir+json",
      },
    });

    return (res.data.entry || []).map((e) => e.resource);
  } catch (err) {
    console.error("FHIR ERROR:", err.message);
    return [];
  }
}

// ============================================================
// GHL SEND
// ============================================================
async function sendToGHL(type, data) {
  if (!data.length) return;

  try {
    await axios.post(CONFIG.GHL_WEBHOOK, {
      source: "ECW_FHIR",
      type,
      count: data.length,
      data,
      timestamp: new Date().toISOString(),
    });

    console.log(`✅ SENT ${type}: ${data.length}`);
  } catch (err) {
    console.error("GHL ERROR:", err.message);
  }
}

// ============================================================
// SYNC (SAFE)
// ============================================================
let running = false;

async function runSync() {
  if (running) return;
  running = true;

  console.log("🔄 SYNC START");

  try {
    const token = await getAccessToken();

    const [patients, encounters] = await Promise.all([
      fetchFHIR(token, "Patient", "_count=20"),
      fetchFHIR(token, "Encounter", "_count=20"),
    ]);

    await sendToGHL("Patients", patients);
    await sendToGHL("Appointments", encounters);

    console.log("✅ SYNC COMPLETE");
  } catch (err) {
    console.error("SYNC ERROR:", err.message);
  } finally {
    running = false;
  }
}

// ============================================================
// ROUTES
// ============================================================
app.get("/", (req, res) => {
  res.json({ status: "running" });
});

app.get("/sync", async (req, res) => {
  try {
    await runSync();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "failed" });
  }
});

// ============================================================
// AUTO SYNC
// ============================================================
setInterval(runSync, 900000);

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("🚀 Server running on", PORT);
  runSync();
});

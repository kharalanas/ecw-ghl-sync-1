const express = require("express");
const axios = require("axios");
const fs = require("fs");
const { SignJWT, importPKCS8 } = require("jose");

const app = express();
app.use(express.json());

// ================= CONFIG =================
const CONFIG = {
  CLIENT_ID: "mNthIYkJe0qV65nnUdhUkWVQrHENLixq1uu8kEpZdQE",
  TOKEN_URL: "http://pit-c3ffa7a8-97ee-45ab-812c-189cbeed73f0/oauth2/token",
  FHIR_BASE: "http://pit-c3ffa7a8-97ee-45ab-812c-189cbeed73f0/fhir/r4",
  GHL_WEBHOOK:
    "https://services.leadconnectorhq.com/hooks/YOUR_WEBHOOK",
  KEY_ID: "totalflow-key-1",
};

// ================= PRIVATE KEY (PEM FILE) =================
const PRIVATE_KEY = fs.readFileSync("./private.key", "utf8");

// ================= JWT GENERATION (FIXED) =================
async function generateJWT() {
  const key = await importPKCS8(PRIVATE_KEY, "RS256");

  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({
    iss: CONFIG.CLIENT_ID,
    sub: CONFIG.CLIENT_ID,
    aud: CONFIG.TOKEN_URL,
    iat: now,
    exp: now + 300,
    jti: `jwt-${Date.now()}`,
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: CONFIG.KEY_ID,
    })
    .sign(key);
}

// ================= ACCESS TOKEN =================
async function getAccessToken() {
  try {
    const jwt = await generateJWT();

    const res = await axios.post(
      CONFIG.TOKEN_URL,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_assertion_type:
          "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: jwt,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      }
    );

    return res.data.access_token;
  } catch (err) {
    console.log("❌ TOKEN ERROR:", err.response?.data || err.message);
    throw err;
  }
}

// ================= FHIR FETCH =================
async function fetchFHIR(token, resource) {
  try {
    const res = await axios.get(
      `${CONFIG.FHIR_BASE}/${resource}?_count=20`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/fhir+json",
        },
      }
    );

    return res.data.entry?.map((e) => e.resource) || [];
  } catch {
    return [];
  }
}

// ================= GHL SEND =================
async function sendToGHL(type, data) {
  if (!data.length) return;

  await axios.post(CONFIG.GHL_WEBHOOK, {
    source: "ECW_FHIR",
    type,
    count: data.length,
    data,
  });

  console.log(`✅ SENT ${type}: ${data.length}`);
}

// ================= SYNC =================
let running = false;

async function runSync() {
  if (running) return;
  running = true;

  console.log("🔄 SYNC START");

  try {
    const token = await getAccessToken();

    const [patients, encounters] = await Promise.all([
      fetchFHIR(token, "Patient"),
      fetchFHIR(token, "Encounter"),
    ]);

    await sendToGHL("Patients", patients);
    await sendToGHL("Appointments", encounters);

    console.log("✅ SYNC COMPLETE");
  } catch (err) {
    console.log("❌ SYNC ERROR:", err.message);
  } finally {
    running = false;
  }
}

// ================= ROUTES =================
app.get("/", (req, res) => {
  res.json({ status: "running" });
});

app.get("/sync", async (req, res) => {
  await runSync();
  res.json({ success: true });
});

// ================= START =================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("🚀 Server running on", PORT);
  runSync();
});

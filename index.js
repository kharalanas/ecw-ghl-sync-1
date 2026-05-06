/**
 * ECW FHIR → GoHighLevel Sync Server (FIXED)
 */

const express = require("express");
const axios = require("axios");
const jose = require("node-jose");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

// ============================================================
// CONFIGURATION
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
// PRIVATE KEY (UNCHANGED)
// ============================================================
const PRIVATE_KEY_JWK = { /* same as yours */ };

// ============================================================
// JWT GENERATE
// ============================================================
async function generateJWT() {
  const keystore = jose.JWK.createKeyStore();
  const key = await keystore.add(PRIVATE_KEY_JWK, "json");
  const privatePem = key.toPEM(true);

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
    privatePem,
    { algorithm: "PS384", keyid: CONFIG.KEY_ID }
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
    scope:
      "system/Patient.read system/Encounter.read system/MedicationRequest.read system/Observation.read",
  });

  const res = await axios.post(CONFIG.TOKEN_URL, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 20000,
  });

  return res.data.access_token;
}

// ============================================================
// FETCH FHIR DATA (SAFE)
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
      timeout: 20000,
    });

    return (res.data.entry || []).map((e) => e.resource);
  } catch (err) {
    console.error(`❌ FHIR ERROR (${resource}):`, err.message);
    return [];
  }
}

// ============================================================
// CLEAN DATA (IMPORTANT FIX)
// ============================================================
function cleanData(type, records) {
  if (!records?.length) return [];

  switch (type) {
    case "Patients":
      return records.map((p) => ({
        id: p.id,
        firstName: p.name?.[0]?.given?.[0] || "",
        lastName: p.name?.[0]?.family || "",
        gender: p.gender || "",
        birthDate: p.birthDate || "",
      }));

    case "Appointments":
      return records.map((e) => ({
        id: e.id,
        status: e.status,
        date: e.period?.start,
      }));

    case "Medications":
      return records.map((m) => ({
        id: m.id,
        status: m.status,
      }));

    case "LabResults":
      return records.map((o) => ({
        id: o.id,
        type: o.code?.text,
        value: o.valueQuantity?.value,
      }));

    default:
      return records;
  }
}

// ============================================================
// SEND TO GHL (FIXED)
// ============================================================
async function sendToGHL(dataType, records) {
  if (!records.length) return;

  try {
    const cleaned = cleanData(dataType, records);

    const res = await axios.post(
      CONFIG.GHL_WEBHOOK,
      {
        source: "ECW_FHIR",
        dataType,
        timestamp: new Date().toISOString(),
        count: cleaned.length,
        data: cleaned,
      },
      { timeout: 20000 }
    );

    console.log(`✅ GHL SENT: ${dataType} (${cleaned.length})`);
  } catch (err) {
    console.error(
      "❌ GHL ERROR:",
      err.response?.data || err.message
    );
  }
}

// ============================================================
// SYNC CONTROL (STOP OVERLAP)
// ============================================================
let isRunning = false;

async function runSync() {
  if (isRunning) return;
  isRunning = true;

  console.log("🔄 Sync started:", new Date().toLocaleString());

  try {
    const token = await getAccessToken();
    const today = new Date().toISOString().split("T")[0];

    const [patients, encounters, medications, observations] =
      await Promise.all([
        fetchFHIR(token, "Patient", "_count=50"),
        fetchFHIR(token, "Encounter", `_count=50&date=ge${today}`),
        fetchFHIR(token, "MedicationRequest", "_count=50"),
        fetchFHIR(token, "Observation", "_count=50"),
      ]);

    await sendToGHL("Patients", patients);
    await sendToGHL("Appointments", encounters);
    await sendToGHL("Medications", medications);
    await sendToGHL("LabResults", observations);

    console.log("✅ SYNC COMPLETE");
  } catch (err) {
    console.error("❌ SYNC ERROR:", err.message);
  } finally {
    isRunning = false;
  }
}

// ============================================================
// ROUTES
// ============================================================
app.get("/", (req, res) => {
  res.json({ status: "running" });
});

app.get("/sync", async (req, res) => {
  const result = await runSync();
  res.json({ success: true });
});

// Auto sync every 15 min
setInterval(runSync, 900000);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
  runSync();
});

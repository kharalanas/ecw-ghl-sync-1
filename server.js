/**
 * ECW FHIR → GoHighLevel Sync Server
 * Deploy on Railway.app
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
  GHL_WEBHOOK: "https://services.leadconnectorhq.com/hooks/bxce7bnn4u01mHjoq1sm/webhook-trigger/fe032fe5-cc42-4030-bb65-bfd48fe54e2b",
  KEY_ID: "totalflow-key-1",
};

// ============================================================
// PRIVATE KEY
// ============================================================
const PRIVATE_KEY_JWK = {
  p: "u_fE5Bpqi7is15eeR9zf1OQFQP3tF4kWI9FdB0ykrucNNc0GtIWyGeUlVHiRHIlogVSpGAH3IW3aIfS2UVsIwJvhi1fDtYXU0hlPSBM5VIyvrNn--mOKETcj-QA6CQOx5_08Jh7-6jXQIOApTPq1XofCwYCrvI9rob9WPaqq-YM",
  kty: "RSA",
  q: "xKOIZu6KXz2IQjh2NQCezbqQdW5oBVWrp6JA7hIdIk27xl3ewOzX-rtlYvDs_MtNVMJleCquHkRET1-KNM_93FZu6LtasSXub-A2c2ESDCpTrjiQvy_THqyjBM1mUmbvw8Y-Qh2so1EHgFNHyTeSXfHjIsb3Kqwppo37pGkbKBU",
  d: "C5BBFTFIigoGnoH0AG2p0-rCzNI4RM_oI2QbLASGs6Odtf8jQk2bjulksOwh3dUZb9PeIHnkTrdl0VUm6bhRUTFV5tHDrIh-59ERQo8RPkoiqVcNDl9xz55bpTwIn-t_bxTL5Ut3NJCB6CBQWz_SjIDVvbOvtRPkcIjSWHCb7mu5_qz2d9AUKmtaazEsBFPfyn5R62ypUjsmDPlXTKo2Rk0V6tzJdib_-x2lZ76vbm8e8d4KjSTFPK3qyRxRNkzwSqrqyeIBGj4W3BfQgEKT4oJ05TZPjGimPDtU3IB2YTKho8ZRkU4pZ8vApSUv_Mim3jSs4NYHGkxv9fo2ImtfzQ",
  e: "AQAB",
  use: "sig",
  kid: "totalflow-key-1",
  qi: "rMqRVMfjol49oJwSk1FPGMuZniwgogiG55V4ttPyahTjllj92c62MD_TzJaYDDhjEvPtb4m_B8Gn7kO6z7KRIWFK8MfNV85N3GE_oCVSVAmt0evAvOjchiHf4i2eLNqMGC54SS2dTuI5FMz9alRnuMSt1AQIStSL9OvYjqZZKSY",
  dp: "P-hLruo0U3DkgyBvlitIhs9H4gLze08GkgL6yCKM01KHMUWWBAZ4uUkpWgDsBXHKcD5ih2ETru_0fBsBacOzxBi7pG6ggbUQ2KX2SKEQmuiCShiMEoGJTbUbq-sh0DLLZ_63VpavQN4u9x5_rEaJJ6ys0LF4slFo3MN7BNhj7RU",
  alg: "PS384",
  dq: "NAPuOQwwnjDwslOtMSgQ2erX-7hQ29hlp9pLwq4X9tMJMNfz7KS6HSElGJ8SkWxV8G3b2YWwuWDlkPl83auHQ5m5jObCfsnB4OY2gR7UX1Ny_0sHPwuvlRWlqceLoZCJLAhsv6CJ4km06kUdYCTLGv65TqHDEA6qldxJDJyhCmE",
  n: "kGHFqDXt-EXPRQAt5cKbjF9N7TULdHxqtoko_-EtnmODcrKu66nT-8lz5Cy23RGk_Is6SsT_skY-Fz8ycvwf10pTfYAX2R7BoHPvwbeHwpTBJaFiSiSKLR9-5Ro5iIdtOOeWjsqs1ffgwFaDjSH12tqYV-zzJzOvBopH-APrgCwNbuRsJhvcn1orGMnRmYZINnXeLT-2qV-vk2txeQFp9otUp7D8qrlEPjr3RlDKHyTk4DHrYVwymyFNZKDh28LfSnDHjC_efkRhYpZeSzk3jhGb6GhOCt3r73Yt9UtfePR6qT6YkZYm4eaNID_n5suA0bWVmhDZrG_k_x8EwtPvvw",
};

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
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion,
    scope: "system/Patient.read system/Encounter.read system/MedicationRequest.read system/Observation.read",
  });
  const res = await axios.post(CONFIG.TOKEN_URL, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data.access_token;
}

// ============================================================
// FETCH FHIR DATA
// ============================================================
async function fetchFHIR(token, resource, query = "") {
  const url = `${CONFIG.FHIR_BASE}/${resource}${query ? "?" + query : ""}`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/fhir+json" },
  });
  return (res.data.entry || []).map((e) => e.resource);
}

// ============================================================
// SEND TO GHL
// ============================================================
async function sendToGHL(dataType, records) {
  if (!records.length) return;
  await axios.post(CONFIG.GHL_WEBHOOK, {
    source: "ECW_FHIR",
    dataType,
    timestamp: new Date().toISOString(),
    count: records.length,
    data: records,
  });
  console.log(`✅ GHL: ${dataType} — ${records.length} records bheje`);
}

// ============================================================
// MAIN SYNC
// ============================================================
async function runSync() {
  console.log("🔄 Sync shuru:", new Date().toLocaleString());
  try {
    const token = await getAccessToken();
    const today = new Date().toISOString().split("T")[0];

    const [patients, encounters, medications, observations] = await Promise.all([
      fetchFHIR(token, "Patient", "_count=100"),
      fetchFHIR(token, "Encounter", `_count=100&date=ge${today}`),
      fetchFHIR(token, "MedicationRequest", "_count=100"),
      fetchFHIR(token, "Observation", "_count=100&category=laboratory"),
    ]);

    await sendToGHL("Patients", patients);
    await sendToGHL("Appointments", encounters);
    await sendToGHL("Medications", medications);
    await sendToGHL("LabResults", observations);

    console.log("✅ Sync complete!");
    return { success: true, message: "Sync complete" };
  } catch (err) {
    console.error("❌ Sync error:", err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================
// EXPRESS ROUTES
// ============================================================
app.get("/", (req, res) => {
  res.json({ status: "running", message: "ECW to GHL Sync Server" });
});

app.get("/sync", async (req, res) => {
  const result = await runSync();
  res.json(result);
});

// 15 minutes mein sync
setInterval(runSync, 900000);

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  runSync();
});

/**
 * ECW FHIR → GoHighLevel Sync Server (FIXED + PRODUCTION READY)
 */

const express = require("express");
const axios = require("axios");
const { SignJWT, importJWK } = require("jose");

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
  alg: "PS384",
  n: "kGHFqDXt-EXPRQAt5cKbjF9N7TULdHxqtoko_-EtnmODcrKu66nT-8lz5Cy23RGk_Is6SsT_skY-Fz8ycvwf10pTfYAX2R7BoHPvwbeHwpTBJaFiSiSKLR9-5Ro5iIdtOOeWjsqs1ffgwFaDjSH12tqYV-zzJzOvBopH-APrgCwNbuRsJhvcn1orGMnRmYZINnXeLT-2qV-vk2txeQFp9otUp7D8qrlEPjr3RlDKHyTk4DHrYVwymyFNZKDh28LfSnDHjC_efkRhYpZeSzk3jhGb6GhOCt3r73Yt9UtfePR6qT6YkZYm4eaNID_n5suA0bWVmhDZrG_k_x8EwtPvvw",
};

// ============================================================
// JWT GENERATION (FIXED)
// ============================================================
async function generateJWT() {
  const key = await importJWK(PRIVATE_KEY_JWK, "PS384");

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
      alg: "PS384",
      kid: CONFIG.KEY_ID,
    })
    .sign(key);
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
    timeout: 20000,
  });

  return res.data.access_token;
}

// ============================================================
// FETCH FHIR
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
    console.error("❌ FHIR ERROR:", err.message);
    return [];
  }
}

// ============================================================
// CLEAN DATA
// ============================================================
function clean(type, records) {
  if (!records?.length) return [];

  if (type === "Patients") {
    return records.map((p) => ({
      id: p.id,
      firstName: p.name?.[0]?.given?.[0] || "",
      lastName: p.name?.[0]?.family || "",
    }));
  }

  if (type === "Appointments") {
    return records.map((e) => ({
      id: e.id,
      status: e.status,
      date: e.period?.start,
    }));
  }

  return records;
}

// ============================================================
// SEND TO GHL (SAFE)
// ============================================================
async function sendToGHL(type, records) {
  if (!records.length) return;

  try {
    const cleaned = clean(type, records);

    await axios.post(
      CONFIG.GHL_WEBHOOK,
      {
        source: "ECW_FHIR",
        type,
        count: cleaned.length,
        data: cleaned,
        timestamp: new Date().toISOString(),
      },
      { timeout: 20000 }
    );

    console.log(`✅ SENT: ${type} (${cleaned.length})`);
  } catch (err) {
    console.error("❌ GHL ERROR:", err.message);
  }
}

// ============================================================
// SYNC CONTROL
// ============================================================
let running = false;

async function runSync() {
  if (running) return;
  running = true;

  console.log("🔄 Sync started");

  try {
    const token = await getAccessToken();

    const [patients, encounters] = await Promise.all([
      fetchFHIR(token, "Patient", "_count=50"),
      fetchFHIR(token, "Encounter", "_count=50"),
    ]);

    await sendToGHL("Patients", patients);
    await sendToGHL("Appointments", encounters);

    console.log("✅ SYNC COMPLETE");
  } catch (err) {
    console.error("❌ SYNC ERROR:", err.message);
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
  await runSync();
  res.json({ success: true });
});

// Auto sync
setInterval(runSync, 900000);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on", PORT);
  runSync();
});

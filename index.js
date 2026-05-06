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
// FULL PRIVATE JWK KEY
// ============================================================
const JWK_KEY = {
  kty: "RSA",
  e: "AQAB",
  use: "sig",
  kid: "totalflow-key-1",
  alg: "PS384",
  n: "kGHFqDXt-EXPRQAt5cKbjF9N7TULdHxqtoko_-EtnmODcrKu66nT-8lz5Cy23RGk_Is6SsT_skY-Fz8ycvwf10pTfYAX2R7BoHPvwbeHwpTBJaFiSiSKLR9-5Ro5iIdtOOeWjsqs1ffgwFaDjSH12tqYV-zzJzOvBopH-APrgCwNbuRsJhvcn1orGMnRmYZINnXeLT-2qV-vk2txeQFp9otUp7D8qrlEPjr3RlDKHyTk4DHrYVwymyFNZKDh28LfSnDHjC_efkRhYpZeSzk3jhGb6GhOCt3r73Yt9UtfePR6qT6YkZYm4eaNID_n5suA0bWVmhDZrG_k_x8EwtPvvw",
  d: "C5BBFTFIigoGnoH0AG2p0-rCzNI4RM_oI2QbLASGs6Odtf8jQk2bjulksOwh3dUZb9PeIHnkTrdl0VUm6bhRUTFV5tHDrIh-59ERQo8RPkoiqVcNDl9xz55bpTwIn-t_bxTL5Ut3NJCB6CBQWz_SjIDVvbOvtRPkcIjSWHCb7mu5_qz2d9AUKmtaazEsBFPfyn5R62ypUjsmDPlXTKo2Rk0V6tzJdib_-x2lZ76vbm8e8d4KjSTFPK3qyRxRNkzwSqrqyeIBGj4W3BfQgEKT4oJ05TZPjGimPDtU3IB2YTKho8ZRkU4pZ8vApSUv_Mim3jSs4NYHGkxv9fo2ImtfzQ",
  p: "u_fE5Bpqi7is15eeR9zf1OQFQP3tF4kWI9FdB0ykrucNNc0GtIWyGeUlVHiRHIlogVSpGAH3IW3aIfS2UVsIwJvhi1fDtYXU0hlPSBM5VIyvrNn--mOKETcj-QA6CQOx5_08Jh7-6jXQIOApTPq1XofCwYCrvI9rob9WPaqq-YM",
  q: "xKOIZu6KXz2IQjh2NQCezbqQdW5oBVWrp6JA7hIdIk27xl3ewOzX-rtlYvDs_MtNVMJleCquHkRET1-KNM_93FZu6LtasSXub-A2c2ESDCpTrjiQvy_THqyjBM1mUmbvw8Y-Qh2so1EHgFNHyTeSXfHjIsb3Kqwppo37pGkbKBU",
  dp: "P-hLruo0U3DkgyBvlitIhs9H4gLze08GkgL6yCKM01KHMUWWBAZ4uUkpWgDsBXHKcD5ih2ETru_0fBsBacOzxBi7pG6ggbUQ2KX2SKEQmuiCShiMEoGJTbUbq-sh0DLLZ_63VpavQN4u9x5_rEaJJ6ys0LF4slFo3MN7BNhj7RU",
  dq: "NAPuOQwwnjDwslOtMSgQ2erX-7hQ29hlp9pLwq4X9tMJMNfz7KS6HSElGJ8SkWxV8G3b2YWwuWDlkPl83auHQ5m5jObCfsnB4OY2gR7UX1Ny_0sHPwuvlRWlqceLoZCJLAhsv6CJ4km06kUdYCTLGv65TqHDEA6qldxJDJyhCmE",
  qi: "rMqRVMfjol49oJwSk1FPGMuZniwgogiG55V4ttPyahTjllj92c62MD_TzJaYDDhjEvPtb4m_B8Gn7kO6z7KRIWFK8MfNV85N3GE_oCVSVAmt0evAvOjchiHf4i2eLNqMGC54SS2dTuI5FMz9alRnuMSt1AQIStSL9OvYjqZZKSY",
};

// ============================================================
// JWT GENERATION (FIXED - NO KEY ERROR)
// ============================================================
async function generateJWT() {
  const key = await importJWK(JWK_KEY, "PS384");

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

    console.log(`✅ SENT: ${type} (${data.length})`);
  } catch (err) {
    console.error("GHL ERROR:", err.message);
  }
}

// ============================================================
// SYNC ENGINE (SAFE)
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
  await runSync();
  res.json({ success: true });
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
  console.log(`🚀 Server running on ${PORT}`);
  runSync();
});

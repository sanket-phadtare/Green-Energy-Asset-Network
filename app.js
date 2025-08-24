/* ==================== FARMER ==================== */
const farmerForm = document.getElementById("farmerForm");
if (farmerForm) {
  farmerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("farmerName").value;
    const res = await fetch("http://localhost:3000/api/farmers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    alert(data.message || data.error);
  });
}

/* ==================== READING ==================== */
const readingForm = document.getElementById("readingForm");
if (readingForm) {
  readingForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const farmer_id = document.getElementById("farmerId").value;
    const kwh = document.getElementById("kwh").value;
    const meter_id = document.getElementById("meterId").value;
    const timestamp = document.getElementById("timestamp").value;

    const res = await fetch("http://localhost:3000/api/readings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ farmer_id, kwh, meter_id, timestamp }),
    });
    const data = await res.json();
    alert(data.message || data.error);
  });
}

/* ==================== ATTESTOR / MINT ==================== */
const verifyForm = document.getElementById("verifyForm");
if (verifyForm) {
  verifyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const readingId = document.getElementById("readingId").value;
    const verifier_notes = document.getElementById("verifierNotes").value;

    const res = await fetch(`http://localhost:3000/api/readings/${readingId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verifier_notes }),
    });
    const data = await res.json();
    alert(data.message || data.error);
  });
}

const mintForm = document.getElementById("mintForm");
if (mintForm) {
  mintForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const attestation_id = document.getElementById("attestationId").value;
    const mint_to = document.getElementById("mintTo").value;

    const res = await fetch("http://localhost:3000/api/mint-from-attestation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attestation_id, mint_to }),
    });
    const data = await res.json();
    alert(data.message || data.error);
  });
}

const loadAssetsBtn = document.getElementById("loadAssets");
const assetsTableBody = document.querySelector("#assetsTable tbody");
if (loadAssetsBtn) {
  loadAssetsBtn.addEventListener("click", async () => {
    const res = await fetch("http://localhost:3000/api/assets");
    const assets = await res.json();
    assetsTableBody.innerHTML = "";
    assets.forEach((a) => {
      assetsTableBody.innerHTML += `<tr>
        <td>${a.id}</td>
        <td>${a.farmer_id}</td>
        <td>${a.certificate_id}</td>
        <td>${a.kwh}</td>
        <td>${a.txn_hash}</td>
      </tr>`;
    });
  });
}

/* ==================== COMPANY ==================== */
// Register
const companyRegisterForm = document.getElementById("companyRegisterForm");
if (companyRegisterForm) {
  companyRegisterForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("regName").value;
    const email = document.getElementById("regEmail").value;
    const password = document.getElementById("regPassword").value;

    const res = await fetch("http://localhost:3000/companies/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    alert(data.message || data.error);
  });
}

// Login
const companyLoginForm = document.getElementById("companyLoginForm");
if (companyLoginForm) {
  companyLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    const res = await fetch("http://localhost:3000/companies/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok) {
      alert("Login successful!");
      companyLoginForm.parentElement.style.display = "none";
      if (companyRegisterForm) companyRegisterForm.parentElement.style.display = "none";

      const dashboardSection = document.getElementById("dashboardSection");
      if (dashboardSection) {
        dashboardSection.style.display = "block";
        document.getElementById("companyDetails").textContent =
          `Name: ${data.company.name}, Email: ${data.company.email}, Wallet: ${data.company.wallet_address}`;

        // Load all certificates
        const assetsRes = await fetch("http://localhost:3000/api/assets");
        const assets = await assetsRes.json();
        const certTableBody = document.querySelector("#certTable tbody");
        certTableBody.innerHTML = "";
        assets.forEach((a) => {
          certTableBody.innerHTML += `<tr>
            <td>${a.id}</td>
            <td>${a.farmer_id}</td>
            <td>${a.certificate_id}</td>
            <td>${a.kwh}</td>
            <td>${a.txn_hash}</td>
          </tr>`;
        });
      }
    } else {
      alert(data.error);
    }
  });
}

// Buy Certificates Button
const buyCertificatesBtn = document.getElementById("buyCertificatesBtn");
if (buyCertificatesBtn) {
  buyCertificatesBtn.addEventListener("click", () => {
    window.location.href = "buy.html";
  });
}

/* ==================== BUY CERTIFICATES PAGE ==================== */
async function loadFarmers() {
  const farmersContainer = document.getElementById("farmersContainer");
  if (!farmersContainer) return;

  const res = await fetch("http://localhost:3000/api/assets");
  const assets = await res.json();
  farmersContainer.innerHTML = "";

  // Group assets by farmer
  const farmerMap = {};
  assets.forEach(a => {
    if (!farmerMap[a.farmer_id]) farmerMap[a.farmer_id] = 0;
    farmerMap[a.farmer_id] += Number(a.kwh); // sum total kWh per farmer
  });

  Object.keys(farmerMap).forEach(farmerId => {
    const card = document.createElement("div");
    card.className = "farmer-card";

    card.innerHTML = `
      <h3>Farmer ID: ${farmerId}</h3>
      <p>Total Energy: ${farmerMap[farmerId]} kWh</p>
    `;

    const btn = document.createElement("button");
    btn.textContent = "Purchase";
    btn.addEventListener("click", () => {
      alert(`Purchased certificates of Farmer ID ${farmerId}`);
      // TODO: implement payment & token transfer
    });
    card.appendChild(btn);

    farmersContainer.appendChild(card);
  });
}

window.onload = loadFarmers;
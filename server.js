// server.js (Full MVP with Pinata + Company)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import { fileURLToPath } from "url";
import path from "path";
import { AptosClient, AptosAccount } from "aptos";
import axios from "axios";
import bcrypt from "bcryptjs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

/* =================== POSTGRESQL =================== */
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

/* =================== APTOS =================== */
const NODE_URL = process.env.APTOS_NODE_URL || "https://fullnode.devnet.aptoslabs.com/v1";
const aptos = new AptosClient(NODE_URL);

/* =================== PINATA =================== */
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

async function pinJsonToPinata(json) {
  try {
    const url = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
    const response = await axios.post(url, json, {
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
        "Content-Type": "application/json",
      },
    });
    return response.data.IpfsHash;
  } catch (err) {
    console.error("Pinata error:", err.response?.data || err.message);
    throw new Error("Failed to pin JSON to Pinata");
  }
}

/* =================== FARMER =================== */
// Register farmer
app.post("/api/farmers", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });

    const newAccount = new AptosAccount();
    const walletAddress = newAccount.address().hex();
    const privateKey = Buffer.from(newAccount.signingKey.secretKey).toString("hex");

    const q = `INSERT INTO farmers (name, wallet_address, private_key) VALUES ($1,$2,$3) RETURNING id,name,wallet_address`;
    const { rows } = await pool.query(q, [name, walletAddress, privateKey]);

    res.json({ message: "Farmer registered", farmer: rows[0], wallet_private_key: privateKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Submit reading
app.post("/api/readings", async (req, res) => {
  try {
    const { farmer_id, meter_id, kwh, timestamp, source } = req.body;
    if (!farmer_id || !kwh || !timestamp)
      return res.status(400).json({ error: "farmer_id, kwh, timestamp required" });

    const q = `INSERT INTO meter_readings (farmer_id, meter_id, kwh, ts, source) VALUES ($1,$2,$3,$4,$5) RETURNING *`;
    const { rows } = await pool.query(q, [farmer_id, meter_id || null, kwh, timestamp, source || null]);

    res.json({ message: "Reading saved", reading: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* =================== ATTESTOR / MINT =================== */
// Attestor verify
app.post("/api/readings/:id/verify", async (req, res) => {
  try {
    const readingId = Number(req.params.id);
    const { verifier_notes } = req.body || {};

    const { rows } = await pool.query(
      `SELECT mr.*, f.wallet_address FROM meter_readings mr 
       JOIN farmers f ON f.id = mr.farmer_id WHERE mr.id=$1`,
      [readingId]
    );
    if (!rows.length) return res.status(404).json({ error: "reading not found" });

    const reading = rows[0];
    if (Number(reading.kwh) <= 0) return res.status(400).json({ error: "invalid kwh" });

    const attestation = {
      version: "1.0",
      farmer_id: reading.farmer_id,
      farmer_wallet: reading.wallet_address,
      meter_id: reading.meter_id,
      kwh: Number(reading.kwh),
      timestamp: reading.ts,
      verified_at: new Date().toISOString(),
      verifier_notes: verifier_notes || "auto-verified",
      verifier: process.env.ATTESTOR_ADDRESS || null,
    };

    const cid = await pinJsonToPinata(attestation);

    const attestorPkHex = process.env.ATTESTOR_PRIVATE_KEY;
    if (!attestorPkHex) return res.status(500).json({ error: "No attestor key configured" });
    const atPk = Buffer.from(attestorPkHex.replace(/^0x/, ""), "hex");
    const attestorAcc = new AptosAccount(atPk);

    const insert = `INSERT INTO attestations (reading_id, attestor_address, ipfs_cid, attestation_json) VALUES ($1,$2,$3,$4) RETURNING *`;
    const { rows: arows } = await pool.query(insert, [readingId, attestorAcc.address().hex(), cid, attestation]);

    res.json({ message: "Attestation created", attestation: arows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Mint certificate from attestation
app.post("/api/mint-from-attestation", async (req, res) => {
  try {
    const { attestation_id, mint_to } = req.body;
    if (!attestation_id || !mint_to)
      return res.status(400).json({ error: "attestation_id and mint_to required" });

    const { rows } = await pool.query(
      `SELECT a.*, mr.farmer_id, mr.kwh, f.wallet_address 
       FROM attestations a 
       JOIN meter_readings mr ON mr.id = a.reading_id 
       JOIN farmers f ON f.id = mr.farmer_id 
       WHERE a.id=$1`,
      [attestation_id]
    );
    if (!rows.length) return res.status(404).json({ error: "attestation not found" });
    const att = rows[0];

    const attCid = att.ipfs_cid;
    const kwh = Number(att.kwh);

    const MODULE_ADDR = process.env.MODULE_ADDRESS;
    if (!MODULE_ADDR) return res.status(500).json({ error: "MODULE_ADDRESS not configured" });

    const cidBytes = Buffer.from(attCid, "utf8");
    const payload = {
      type: "entry_function_payload",
      function: `${MODULE_ADDR}::rwa_registry::issue_certificate`,
      type_arguments: [],
      arguments: [mint_to, Array.from(cidBytes), kwh.toString()],
    };

    const attestorPkHex = process.env.ATTESTOR_PRIVATE_KEY;
    const atPk = Buffer.from(attestorPkHex.replace(/^0x/, ""), "hex");
    const attestorAcc = new AptosAccount(atPk);

    const txnRequest = await aptos.generateTransaction(attestorAcc.address(), payload);
    const signedTxn = await aptos.signTransaction(attestorAcc, txnRequest);
    const txnRes = await aptos.submitTransaction(signedTxn);
    await aptos.waitForTransaction(txnRes.hash);

    const insert = `INSERT INTO assets (farmer_id, attestation_id, txn_hash, certificate_id, kwh) VALUES ($1,$2,$3,$4,$5) RETURNING *`;
    const { rows: arows } = await pool.query(insert, [att.farmer_id, attestation_id, txnRes.hash, `cert:${txnRes.hash}`, kwh]);

    await pool.query("UPDATE meter_readings SET status='verified' WHERE id=$1", [att.reading_id]);

    res.json({ message: "Minted on-chain", txnHash: txnRes.hash, asset: arows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// List assets
app.get("/api/assets", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM assets ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* =================== COMPANY =================== */
// Register company
app.post("/companies/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "Name, email, and password required" });

    // Generate Aptos wallet
    const newAccount = new AptosAccount();
    const walletAddress = newAccount.address().hex();
    const privateKey = Buffer.from(newAccount.signingKey.secretKey).toString("hex");

    // Save in DB
    const q = `
      INSERT INTO companies (name, email, password, wallet_address, private_key)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, name, email, wallet_address
    `;
    const { rows } = await pool.query(q, [name, email, password, walletAddress, privateKey]);

    res.json({ message: "Company registered", company: rows[0] });
  } catch (err) {
    console.error(err);
    if (err.code === "23505") res.status(400).json({ error: "Email already exists" });
    else res.status(500).json({ error: String(err) });
  }
});

// Login company
app.post("/companies/login", async (req, res) => {
  const { email, password } = req.body;
  const q = "SELECT * FROM companies WHERE email=$1 AND password=$2";
  const { rows } = await pool.query(q, [email, password]);
  if (rows.length === 0) return res.status(401).json({ error: "Invalid email or password" });
  res.json({ message: "Login successful", company: rows[0] });
});


// Get platform summary
app.get("/api/summary", async (_req, res) => {
  try {
    const totalKwhRes = await pool.query("SELECT SUM(kwh) AS total_kwh FROM meter_readings");
    const totalFarmersRes = await pool.query("SELECT COUNT(*) AS total_farmers FROM farmers");
    const totalCompaniesRes = await pool.query("SELECT COUNT(*) AS total_companies FROM companies");

    res.json({
      totalKwh: totalKwhRes.rows[0].total_kwh || 0,
      totalFarmers: totalFarmersRes.rows[0].total_farmers || 0,
      totalCompanies: totalCompaniesRes.rows[0].total_companies || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});



/* =================== START SERVER =================== */
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Server running on ${port}`));

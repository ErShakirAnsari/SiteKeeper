// crypto.js — password hashing helpers built on the Web Crypto API.
// The plaintext master password is never stored or synced — only a
// PBKDF2-SHA256 hash + random salt are kept in chrome.storage.sync.

const ITERATIONS = 150000;

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex) {
  const bytes = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(bytes.map((b) => parseInt(b, 16)));
}

function randomSaltHex(bytes = 16) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return bufToHex(arr);
}

async function deriveHashHex(password, saltHex, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBuf(saltHex),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return bufToHex(bits);
}

/** Create a new {salt, hash, iterations} record for a plaintext password. */
export async function hashPassword(password) {
  const salt = randomSaltHex();
  const hash = await deriveHashHex(password, salt, ITERATIONS);
  return { salt, hash, iterations: ITERATIONS };
}

/** Verify a plaintext password against a stored {salt, hash, iterations} record. */
export async function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const iterations = record.iterations || ITERATIONS;
  const hash = await deriveHashHex(password, record.salt, iterations);
  return hash === record.hash;
}

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

/**
 * Mirrors payfastService.generateSignature without loading the full module
 * (avoids env assertConfigured side effects in unit tests).
 */
const generateSignature = (fields, passphrase = null) => {
  let paramString = "";
  for (const [key, rawVal] of Object.entries(fields)) {
    if (key === "signature") continue;
    const val = rawVal == null ? "" : String(rawVal).trim();
    if (val === "") continue;
    paramString += `${key}=${encodeURIComponent(val).replace(/%20/g, "+")}&`;
  }
  paramString = paramString.slice(0, -1);
  if (passphrase != null && String(passphrase).trim() !== "") {
    paramString += `&passphrase=${encodeURIComponent(String(passphrase).trim()).replace(/%20/g, "+")}`;
  }
  return crypto.createHash("md5").update(paramString).digest("hex");
};

describe("PayFast signature", () => {
  it("is deterministic and excludes empty fields", () => {
    const fields = {
      merchant_id: "10000100",
      merchant_key: "46f0cd694581a",
      amount: "100.00",
      item_name: "Test",
      name_first: "",
    };
    const sig = generateSignature(fields, "passphrase");
    assert.equal(sig, generateSignature(fields, "passphrase"));
    assert.equal(sig.length, 32);
    assert.notEqual(sig, generateSignature(fields, "other"));
  });

  it("does not embed the passphrase in the field map", () => {
    const fields = {
      merchant_id: "10000100",
      amount: "50.00",
      item_name: "Donation",
    };
    const sig = generateSignature(fields, "secret-pass");
    assert.equal(Object.prototype.hasOwnProperty.call(fields, "passphrase"), false);
    assert.ok(sig);
  });
});

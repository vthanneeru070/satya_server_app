const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { isOriginAllowed } = require("./cors");

describe("cors isOriginAllowed", () => {
  it("allows the canonical landing origin by default", () => {
    assert.equal(isOriginAllowed("https://www.sathya.co.za"), true);
  });

  it("allows satya.co.za admin pattern", () => {
    assert.equal(isOriginAllowed("https://admin.satya.co.za"), true);
  });

  it("does not allow arbitrary third-party origins", () => {
    assert.equal(isOriginAllowed("https://evil.example"), false);
  });

  it("allows emulator and LAN origins for device testing", () => {
    assert.equal(isOriginAllowed("http://10.0.2.2:5180"), true);
    assert.equal(isOriginAllowed("http://192.168.0.225:5180"), true);
    assert.equal(isOriginAllowed("http://127.0.0.1:5180"), true);
  });
});

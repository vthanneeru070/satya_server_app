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
});

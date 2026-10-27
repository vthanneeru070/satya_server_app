const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { websiteInitiateDonationSchema } = require("./websiteDonationValidation");

describe("websiteInitiateDonationSchema", () => {
  it("accepts a valid website donation payload", () => {
    const { error, value } = websiteInitiateDonationSchema.validate({
      amount: 100,
      email: "donor@example.com",
      nameFirst: "Ada",
    });
    assert.equal(error, undefined);
    assert.equal(value.currency, "ZAR");
    assert.equal(value.amount, 100);
  });

  it("rejects zero, negative, and excessive amounts", () => {
    for (const amount of [0, -5, 1_000_001]) {
      const { error } = websiteInitiateDonationSchema.validate({
        amount,
        email: "donor@example.com",
      });
      assert.ok(error, `expected rejection for amount=${amount}`);
    }
  });

  it("requires email", () => {
    const { error } = websiteInitiateDonationSchema.validate({ amount: 50 });
    assert.ok(error);
  });

  it("rejects non-ZAR currency", () => {
    const { error } = websiteInitiateDonationSchema.validate({
      amount: 50,
      email: "donor@example.com",
      currency: "USD",
    });
    assert.ok(error);
  });
});

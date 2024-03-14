const request = require("supertest");
const app = require("../lib/app");
const forge = require("node-forge");
const path = require("path");
const fs = require("fs");

const digest = "7B25E5DAE8FF485FBEE9D9292E1DF93686BE89336871394CE2778F0B3E4C3F91";
const contentsFixture = path.resolve(__dirname, `fixtures/${digest}.dat`);
const encodedContents = fs.readFileSync(contentsFixture).toString("base64");

const toBeAValidSignatureResponse = (response) => {
  expect(() => {
    forge.asn1.fromDer(response.body.toString("binary"));
  }).not.toThrow();
};

describe("App test", () => {
  test("GET /", () => {
    return request(app).get("/").expect(200);
  });

  describe("POST /sign", () => {
    describe("For a user with signing rights", () => {
      test("responds with a valid PKCS7 container", () => {
        const payload = {
          document_digest: digest,
          encoded_contents: encodedContents,
          signing_token: "user-1-with-rights",
        };

        return request(app)
          .post("/sign")
          .send(payload)
          .expect(200)
          .expect(toBeAValidSignatureResponse);
      });
    });

    describe("For a user without signing rights", () => {
      test("returns unauthorized", () => {
        const payload = {
          document_digest: digest,
          encoded_contents: encodedContents,
          signing_token: "user-2-with-rights",
        };

        return request(app).post("/sign").send(payload).expect(401);
      });
    });
  });
});

import request from "supertest";
import * as asn1js from "asn1js";
import forge from "node-forge";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import app from "../lib/app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const digest = "7B25E5DAE8FF485FBEE9D9292E1DF93686BE89336871394CE2778F0B3E4C3F91";
const contentsFixture = path.resolve(__dirname, `fixtures/${digest}.dat`);
const encodedContents = fs.readFileSync(contentsFixture).toString("base64");
const signerCertificate = fs.readFileSync(path.resolve(__dirname, "../certs/test-signer.cert"));

const toBeAValidSignatureResponse = (response) => {
  const parsedSignature = asn1js.fromBER(response.body);
  expect(parsedSignature.offset).toBe(response.body.length);

  const contentInfo = parsedSignature.result;
  const signedData = contentInfo.valueBlock.value[1].valueBlock.value[0];
  const signerInfos = signedData.valueBlock.value.at(-1);
  const signerInfo = signerInfos.valueBlock.value[0];
  const signedAttributes = signerInfo.valueBlock.value.find(
    (value) => value.idBlock.tagClass === 3 && value.idBlock.tagNumber === 0
  );

  expect(signedAttributes).toBeDefined();

  const attributes = signedAttributes.valueBlock.value;
  const attributeOids = attributes.map((attribute) =>
    attribute.valueBlock.value[0].valueBlock.toString()
  );

  expect(attributeOids).toEqual(
    expect.arrayContaining([
      forge.pki.oids.contentType,
      forge.pki.oids.messageDigest,
      forge.pki.oids.signingTime,
    ])
  );

  const encodedAttributes = attributes.map((attribute) =>
    Buffer.from(attribute.valueBeforeDecodeView)
  );

  expect(encodedAttributes).toEqual([...encodedAttributes].sort(Buffer.compare));
};

describe("App test", () => {
  test("GET /", () => {
    return request(app).get("/").expect(200);
  });

  describe("POST /sign", () => {
    describe("For a user with signing rights", () => {
      test("responds with a DER-canonical PKCS7 container", () => {
        const payload = {
          action: "sign_pkcs7",
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

      test("responds with a valid raw signature", async () => {
        const dataToBeSigned = Buffer.from("data to sign");
        const response = await request(app)
          .post("/sign")
          .send({
            action: "sign",
            data_to_be_signed: dataToBeSigned.toString("base64"),
            signing_token: "user-1-with-rights",
          })
          .expect(200);

        expect(crypto.verify("SHA-256", dataToBeSigned, signerCertificate, response.body)).toBe(
          true
        );
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

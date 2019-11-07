const express = require("express");
const forge = require("node-forge");
const fs = require("fs");
const app = express();
const users = require("./users");

// Setup crypto infrastructure

const certificatePem = fs.readFileSync("./certs/certificate.pem");
const privateKeyPem = fs.readFileSync("./certs/private-key.pem");
const certificate = forge.pki.certificateFromPem(certificatePem);
const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

// Signing function

const sign = documentContents => {
  let p7 = forge.pkcs7.createSignedData();
  p7.content = new forge.util.ByteBuffer(documentContents);
  p7.addCertificate(certificate);
  p7.addSigner({
    key: privateKey,
    certificate: certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    // See section 5.3 at https://tools.ietf.org/html/rfc2985#page-12 for list
    // of allowed attributes
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data
      },
      {
        type: forge.pki.oids.messageDigest
      },
      {
        type: forge.pki.oids.signingTime,
        value: new Date()
      }
    ]
  });

  p7.sign({ detached: true });

  // Return the signature as DER in binary format
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
};

app.use(express.json({ limit: "100mb" }));

app.get("/", (req, res) => res.send("Hello World!"));

app.post("/sign", (req, res) => {
  const userId = req.body.signing_token;
  const documentContents = Buffer.from(req.body.encoded_contents, "base64");

  if (users.canSign(userId)) {
    const pkcs7 = sign(documentContents);

    res.send(pkcs7);
  } else {
    res.status(401);
    res.send("Unauthorized");
  }
});

module.exports = app;

import express from "express";
import * as fs from "fs";

import * as users from "./users.js";

import { requestLoggerMiddleware } from "./logger-middleware.js";

import SignPrivateKeyPkcs7 from "./examples/sign-private-key-pkcs7.js";
import SignPrivateKeyRaw from "./examples/sign-private-key-raw.js";
import SignHsmRaw from "./examples/sign-hsm-raw.js";
import SignHsmPkcs7 from "./examples/sign-hsm-pkcs7.js";

// Certificates of Certificate Authorities (CA) that form a certificate
// chain from the root CA to the signer certificate.
//
// Full certificate chain needs to be embedded in the signature to validate properly.
//
// PSPDFKit Document Engine needs to obtain the trusted certificate chain up to the root authority
// that issued it when validating signatures. It will search for trusted root certificate
// stores at the /certificate-stores path inside its container. You can mount a folder
// from the host machine containing your certificates.
const caCertificatePaths = ["./certs/test-ca.cert"];

// Path to our signer certificate.
const signerCertificatePath = "./certs/test-signer.cert";
const signerCertificatePem = fs.readFileSync(signerCertificatePath);
// Path to our signer private key that corresponds to the signer certificate.
const signerPrivateKeyPath = "./certs/test-signer.key";

/**
 * Returns the full certificate chain for the signature, needs to include
 * signer certificate as well as any CA in the certificate chain.
 *
 * Used only for RAW RSA signing (see signRaw() function above).
 *
 * @return Array of Base64 encoded certificates in PEM format. First element of the array needs to be the signer certificate.
 */
function getCertificates() {
  const base64CACerts = caCertificatePaths.map((file) => {
    const certPem = fs.readFileSync(file);
    return certPem.toString("base64");
  });

  return {
    certificates: [signerCertificatePem.toString("base64")],
    ca_certificates: base64CACerts,
  };
}

async function handleSignPkcs7(req, res) {
  const userId = req.body.signing_token;

  const signHandler = users.useHsm(userId)
    ? new SignHsmPkcs7(caCertificatePaths, signerCertificatePath)
    : new SignPrivateKeyPkcs7(caCertificatePaths, signerCertificatePath, signerPrivateKeyPath);

  const documentContents = Buffer.from(req.body.encoded_contents, "base64");
  return await signHandler.sign(documentContents, req.body.hash_algorithm || "sha256");
}

async function handleSignRaw(req, res) {
  const userId = req.body.signing_token;

  const signHandler = users.useHsm(userId)
    ? new SignHsmRaw()
    : new SignPrivateKeyRaw(caCertificatePaths, signerCertificatePath, signerPrivateKeyPath);

  const dataToBeSigned = Buffer.from(req.body.data_to_be_signed, "base64");
  return await signHandler.sign(dataToBeSigned, req.body.hash_algorithm || "sha256");
}

function sendSignedData(res, signedData) {
  if (signedData) {
    res.send(signedData);
  } else {
    res.status(400);
    res.send("Signing failed");
  }
}

const app = express();

app.use(express.json({ limit: "100mb" }));
app.use(requestLoggerMiddleware({ logger: console.log }));

app.get("/", (_req, res) => res.send("Hello World!"));

app.post("/sign", async (req, res) => {
  const userId = req.body.signing_token;
  const action = req.body.action || "sign";

  if (action == "get_certificates") {
    try {
      res.send(getCertificates());
    } catch (e) {
      console.log(e);
      res.status(400);
      res.send(e.message);
    }
  } else if (users.canSign(userId)) {
    if (action == "sign_pkcs7") {
      const signedData = await handleSignPkcs7(req, res);
      sendSignedData(res, signedData);
    } else if (action == "sign") {
      const signedData = await handleSignRaw(req, res);
      sendSignedData(res, signedData);
    } else {
      res.status(400);
      res.send(`Unknown action ${action}`);
    }
  } else {
    res.status(401);
    res.send("Unauthorized");
  }
});

export default app;

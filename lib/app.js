import express from "express";

import { DEFAULT_SIGN_METHOD, SignMethod } from "./sign-method.js";
import * as users from "./users.js";

import { requestLoggerMiddleware } from "./logger-middleware.js";

// We create a single signing handler per signing method for the whole
// lifetime of the signing service. That way, we can store data we
// want to preserve across endpoint calls.
let signingHandlers = new Map();

/**
 * Parse signing token used in this example. Which can be either:
 * 1. JSON string with `userId` of the signer and `signMethod` to use.
 * 2. String representing the `userId` of the signer.
 */
export const parseSigningToken = (signingToken) => {
  try {
    const signToken = JSON.parse(signingToken);

    return {
      userId: signToken["userId"],
      signMethod: signToken["signMethod"]
        ? SignMethod.valueOf(signToken["signMethod"])
        : DEFAULT_SIGN_METHOD,
    };
  } catch {
    return {
      userId: signingToken,
      signMethod: DEFAULT_SIGN_METHOD,
    };
  }
};

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
  const signToken = parseSigningToken(req.body.signing_token);
  if (!signToken.signMethod) {
    res.status(400);
    res.send("Invalid sign method");
    return;
  }

  let signingHandler = signingHandlers.get(signToken.signMethod);
  if (!signingHandler) {
    console.log(`Initializing signing handler "${signToken.signMethod.name}"`);
    signingHandler = signToken.signMethod.getSignMethodHandler();
    signingHandlers.set(signToken.signMethod, signingHandler);
  }

  try {
    const action = req.body.action || "sign";
    const signatureType = req.body.signature_type || "cms";

    if (action == "get_certificates") {
      const certificates = await signingHandler.getCertificates();
      res.send(certificates);
    } else if (users.canSign(signToken.userId)) {
      if (action == "sign_pkcs7") {
        if (signatureType == "cades") {
          res.status(400);
          res.send(
            "CAdES PKCS#7 signatures are not supported by this example, use RAW signature container instead."
          );
          return;
        }

        const documentContents = Buffer.from(req.body.encoded_contents, "base64");
        const signedData = await signingHandler.signPkcs7(
          documentContents,
          req.body.hash_algorithm || "sha256"
        );
        sendSignedData(res, signedData);
      } else if (action == "sign") {
        const dataToBeSigned = Buffer.from(req.body.data_to_be_signed, "base64");
        const signedData = await signingHandler.signRaw(
          dataToBeSigned,
          req.body.hash_algorithm || "sha256"
        );
        sendSignedData(res, signedData);
      } else {
        res.status(400);
        res.send(`Unknown action ${action}`);
      }
    } else {
      res.status(401);
      res.send("Unauthorized");
    }
  } catch (e) {
    console.log(e);
    res.status(500);
    res.send(e.message);
  }
});

export default app;

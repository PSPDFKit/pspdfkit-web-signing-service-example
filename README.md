# Nutrient Document Engine Signing Service Example

This application implements a signing service compatible with Nutrient Document Engine and its digital signatures signing API in Node JS.

## Support, Issues and License Questions

Nutrient offers support for customers with an active SDK license via https://support.nutrient.io/hc/requests/new

Are you [evaluating our SDK](https://www.nutrient.io/sdk/try)? That's great, we're happy to help out! To make sure this is fast, please use a work email and have someone from your company fill out our sales form: https://www.nutrient.io/contact-sales?=sdk

# Setting up Certification Authority and signing certificate for testing purposes

Please refer to the [dedicated document](certs/README.md).

# Setup

## With Docker

The example can be built and tagged with:

`docker build -t pspdfkit/signing-server-example .`

Once built it can be run as:

```
docker run \
  --env SIGNING_SERVICE_PORT=6000 \
  --publish 6000:6000 \
  pspdfkit/signing-server-example:latest
```

This will make it accessible on the host machine at `http://localhost:6000`.

With Docker Compose, it can be setup along Nutrient Document Engine as:

```
services:
  signing_service:
    build: .
    environment:
      SIGNING_SERVICE_PORT: 6000
    ports:
      - 6000:6000
  document_engine:
    ...
    environment:
      SIGNING_SERVICE_URL: http://signing_service:6000/sign
```

See `docker-compose.yml` for a complete example.

## Without Docker

Install dependencies with `npm install`.

You can then:

- Run the example with `npm run start`
- Run tests with `npm test`

# How does it work

The application exposes the `/sign` endpoint that represents an implementation of Document Engine's signing service callback. Please refer to "Callbacks" section of Document Engine's `/sign` endpoint [reference](https://www.nutrient.io/api/reference/document-engine/upstream/#tag/Digital-Signatures/operation/sign-document) to understand the full protocol.

For an introduction to digital signing refer to our [digital signatures guides](https://www.nutrient.io/guides/document-engine/signatures/).

# Basic Usage

You can use Document Engine's API to sign document `my-document-id`:

```
curl -X 'POST' 'http://localhost:5000/api/documents/my-document-id/sign' \
  -H 'Accept: application/json' \
  -H 'Authorization: Token token="secret"' \
  -H 'Content-Type: application/json' \
  -d '{
     "signingToken": "{\"userId\": \"user-1-with-rights\", \"signMethod\": \"privatekey\"}"
  }'
```

The request contains a `signingToken` attribute whose value is entirely under your control. The example in this repository shows how you can potentially use it to forward parameters for the signing process:
* `userId` as an authentication and authorization token that the signing service uses to determine if the caller of the API has enough rights to perform the signature.
* `signMethod` to instruct the example which of the available example signing methods to use.

Signing service should respond with `200` on success. If the signing service responds with an error in the `4xx` range, Document Engine will fail the original request with a `400` error, logging the response received by the signing service.

> ℹ️ Refer to the [app.js](lib/app.js) file to discover how the signing service callbacks are implemented.

> 💡 Note: The example logs all requests and responses to the `/sign` endpoint to give you better idea how Document Engine interacts with the signing service.

# Advanced Usage

Document Engine's digital signatures process can be customized simply by passing additional options during sign request:

```
curl -X 'POST' 'http://localhost:5000/api/documents/my-document-id/sign' \
  -H 'Accept: application/json' \
  -H 'Authorization: Token token="secret"' \
  -H 'Content-Type: application/json' \
  -d '{
    "signatureContainer": "raw",
    "signatureType": "cades",
    "signingToken": "{\"userId\": \"user-1-with-rights\", \"signMethod\": \"privatekey\"}",
    "flatten": false,
    "estimatedSize": 16384,
    "hashAlgorithm": "sha256",
    "appearance": {
      "mode": "signatureOnly",
      "contentType": "image/png",
      "showSigner": true,
      "showReason": true,
      "showLocation": true,
      "showWatermark": true,
      "showSignDate": true
    },
    "position": {
      "pageIndex": 0,
      "rect": [
        0,
        0,
        100,
        100
      ]
    },
    "signatureMetadata": {
      "signerName": "John Appleseed",
      "signatureReason": "accepted",
      "signatureLocation": "Vienna"
    },
    "cadesLevel": "b-lt"
  }'
```

For detailed explanation of these options, refer to our [API reference](https://www.nutrient.io/api/reference/document-engine/upstream/#tag/Digital-Signatures/operation/sign-document)

# Signing with Private Key

> ℹ️ [Source code](lib/examples/private-key-example.js)

## PKCS#7 Signing

> ℹ️ [Source code](lib/examples/sign-private-key-pkcs7.js)

Document Engine sign request that creates CMS signature via PKCS#7 container created by the signing service:

```
curl -X 'POST' 'http://localhost:5000/api/documents/my-document-id/sign' \
  -H 'Accept: application/json' \
  -H 'Authorization: Token token="secret"' \
  -H 'Content-Type: application/json' \
  -d '{
     "signatureContainer": "pkcs7",
     "signatureType": "cms",
     "signingToken": "{\"userId\": \"user-1-with-rights\", \"signMethod\": \"privatekey\"}"
  }'
```

> 💡 Note that this example supports CMS signatures only.

Under the hood, Document Engine will call the signing service with the following request:

```
POST http://signing_service:6000/sign
Content-Type: application/json

{
  action: 'sign_pkcs7',
  digest: '<base16 encoded hash of the document>',
  encoded_contents: '<base64 encoded document contents>',
  signature_type: 'cms',
  signing_token: '{"userId": "user-1-with-rights", "signMethod": "privatekey"}'
}
```

When performing signing operation with `signatureContainer` set to `pkcs7` (default), signing service receives the byte range and a hash representation of the current state of the document. The signing service is responsible to digitally sign the digest and produce a valid PCKS#7 signature container, encoded in DER format and return it as a response body with status `200`. Document byte range is also provided as `encoded_contents` to allow signing service to calculate the digest manually before signing.

### Verify the Returned PKCS#7

```
curl http://localhost:6000/sign \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"action": "sign_pkcs7", "digest : "<content-hash>", "encoded_contents" : "<base64-encoded-contents>", "signing_token" : "user-1-with-rights"}'
  | openssl pkcs7 -inform DER -text -print
```

## RAW Signing

> ℹ️ [Source code](lib/examples/sign-private-key-pkcs7.js)

Document Engine provides an option to perform signing without producing PKCS#7 container.

For example, this sign request creates CAdES signature with raw signature:

```
curl -X 'POST' 'http://localhost:5000/api/documents/my-document-id/sign' \
  -H 'Accept: application/json' \
  -H 'Authorization: Token token="secret"' \
  -H 'Content-Type: application/json' \
  -d '{
     "signatureContainer": "raw",
     "signatureType": "cades",
     "signingToken": "{\"userId\": \"user-1-with-rights\", \"signMethod\": \"privatekey\"}"
  }'
```

Under the hood, Document Engine will call the signing service with the following requests:

### 1. Get Certificates

When performing signing operation with `signature_type` `cades`, caller needs to provide a list of certificates used for signing either via signing request directly or via a signing service. If the certificates are not provided in the signing request, this callback will be invoked. It's strongly recommended to use the signing service callback for providing the certificates as this way you don't need to distribute them to your Document Engine API clients and can keep them collocated with the signing service.

```
POST http://signing_service:6000/sign
Content-Type: application/json

{ action: 'get_certificates' }
```

Signing service needs to respond with a JSON with base64 encoded PEM certificates.

```
{
  certificates: [
    '<base64 encoded PEM certificate>',
    '<base64 encoded PEM certificate>'
  ],
  ca_certificates: [
    '<base64 encoded PEM certificate>',
    '<base64 encoded PEM certificate>'
  ]
}
```

### 2. Signing Request

```
POST http://signing_service:6000/sign
Content-Type: application/json

{
  action: 'sign',
  data_to_be_signed: '<payload that needs to be signed by signing service>',
  hash_algorithm: 'sha256',
  signature_type: 'cades',
  signing_token: '{"userId": "user-1-with-rights", "signMethod": "privatekey"}'
}
```

When performing signing operation with `signatureContainer` set to `raw`, signing service receives a binary representation of the current state of the document. Signing service is responsible to digitally sign this payload and return `200` response with DER encoded [RSASSA-PKCS1-v1_5](https://datatracker.ietf.org/doc/html/rfc3447#section-8.2) payload.

# Signing via HSM

Document Engine signing module can easily integrate with a broad range of third-party devices or cloud services. For instance, integration with a Hardware Security Module (HSM) adds an additional level of security to document processing and management workflows. HSMs are special devices designed to safeguard sensitive data and cryptographic keys. By delegating cryptographic operations to an HSM, the confidentiality, integrity, and availability of your documents are significantly enhanced.

This example shows how to implement signing via a software based HSM (SoftHSMv2) running locally. Clients interact with HSMs via [PKCS#11](https://www.cryptsoft.com/pkcs11doc/) interface. This means that this example should provide you with a good starting point in integrating with your specific HSM.

## Setup

### With Docker

If you run this example via the provided Docker file, the SoftHSM is already ready to use.

### Without Docker

To setup SoftHSM without Docker, follow these steps:

1. Install the [SoftHSMv2](https://github.com/opendnssec/SoftHSMv2) for the platform of your choice.
    1. If you are using macOS, you can install it via brew:
        ```sh
        brew install softhsm
        ```
    2. Take a note of the install location, you'll need it later:
        ```sh
        ==> Pouring softhsm--2.6.1.arm64_ventura.bottle.2.tar.gz
        🍺  /opt/homebrew/Cellar/softhsm/2.6.1: 16 files, 2.6MB
        ```

2. [Generate test certificates](certs/README.md) if you haven't done so already.

3. Import the test private key into the HSM.
    1. Initialize the token with name test-key in the first free slot in the HSM.
       For example purposes, we are setting the PIN to 1234 and Security Officer pin to 0000.
       ```sh
       softhsm2-util --init-token --free --label test-key --pin 1234 --so-pin 0000
       ```
    2. Import the signer private key into the created slot. You can pick any ID and label.
       ```sh
       softhsm2-util --import certs/test-signer.key --token test-key --label test-key --id CAFED00D --pin 1234
       ```

4. Export your pin as env variable
   ```sh
   export HSM_PIN=1234
   ```

5. Export the location of your HSM module as env variable
   ```sh
   export HSM_MODULE=$(brew --prefix)/lib/softhsm/libsofthsm2.so
   ```

5. Run the example as explained before:
   ```
   npm install
   npm run start
   ```

## HSM Signing Examples

> ℹ️ [Source code](lib/examples/hsm-example.js)

To sign with our HSM example, set `signMethod` to `hsm` inside your `signingToken` to instruct the example to use SoftHSM for signing.

### Using PKCS#7 Container

> ℹ️ [Source code](lib/examples/sign-hsm-pkcs7.js)

```
curl -X 'POST' 'http://localhost:5000/api/documents/my-document-id/sign' \
  -H 'Accept: application/json' \
  -H 'Authorization: Token token="secret"' \
  -H 'Content-Type: application/json' \
  -d '{
     "signatureContainer": "pkcs7",
     "signatureType": "cms",
     "signingToken": "{\"userId\": \"user-1-with-rights\", \"signMethod\": \"hsm\"}"
  }'
```

### RAW Signing

> ℹ️ [Source code](lib/examples/sign-hsm-raw.js)

```
curl -X 'POST' 'http://localhost:5000/api/documents/my-document-id/sign' \
  -H 'Accept: application/json' \
  -H 'Authorization: Token token="secret"' \
  -H 'Content-Type: application/json' \
  -d '{
     "signatureContainer": "raw",
     "signatureType": "cades",
     "signingToken": "{\"userId\": \"user-1-with-rights\", \"signMethod\": \"hsm\"}"
  }'
```

# Signing via AWS CloudHSM

The default image runs SoftHSMv2 on Alpine. AWS builds the CloudHSM Client SDK 5 PKCS#11 library against glibc, so it cannot be loaded there. `Dockerfile.cloudhsm` builds the same application on Ubuntu 24.04, one of the platforms AWS supports, with the PKCS#11 library installed into the image:

```sh
docker build -f Dockerfile.cloudhsm -t signing-service-cloudhsm .
```

The library is installed rather than mounted from `/opt/cloudhsm` on the host, so the image also runs where no host filesystem is available, such as a task on AWS Fargate.

The container configures the CloudHSM client at startup and then starts the application. Configure it with the following environment variables:

| Variable | Required | Description |
| -- | -- | -- |
| `HSM_PIN` | yes | Crypto user credentials, in the form `user:password`. |
| `HSM_CA_CERT` | yes | Path to the cluster certificate that signed the HSM's identity. |
| `HSM_CLUSTER_ID` | one of | ID of the cluster. The client discovers the HSM addresses from it. |
| `HSM_IP_ADDRESS` | one of | ENI address of a single HSM, when discovery is not used. |
| `AWS_REGION` | with `HSM_CLUSTER_ID` | Region of the cluster. Discovery also needs credentials allowed to describe it. |
| `HSM_SIGNER_CERTIFICATE` | yes | Path to the certificate issued for the signing key. |
| `HSM_CA_CERTIFICATES` | yes | Comma-separated paths to the certificate chain above the signer certificate. |
| `HSM_KEY_LABEL` | | `CKA_LABEL` of the signing key. |
| `HSM_KEY_ID` | | `CKA_ID` of the signing key, as hexadecimal digits. |
| `HSM_LOG_LEVEL` | | One of `error`, `warn`, `info`, `debug`, `trace`. Defaults to `info`. |

This image ships no test certificates, so both certificate variables are required and the container refuses to start without them. On a platform with no host filesystem, such as Fargate, supply them by building a derived image that copies them in, by mounting a volume such as EFS, or by writing them to disk at startup from a secret store. `configure-pkcs11` rewrites the client configuration under `/opt/cloudhsm` on every start, so that path has to stay writable.

The chain in `HSM_CA_CERTIFICATES` is returned to Document Engine by the `get_certificates` callback, which is used for the RAW container. For PKCS#7 the chain has to reach Document Engine through the certificate store it reads from `/certificate-stores`.

Client logs go to the terminal rather than to the SDK's default log file, so they appear wherever your scheduler collects container output.

## Selecting the signing key

A cluster usually holds more than one key. Set `HSM_KEY_LABEL` or `HSM_KEY_ID` to say which one to sign with; the example then requires exactly one match and fails if it finds none or several. With neither set it uses the first private key on the token, which is what the SoftHSM example relies on.

The certificate in `HSM_SIGNER_CERTIFICATE` has to be the one issued for that key. The example compares the certificate's public key against the key's `CKA_MODULUS` and `CKA_PUBLIC_EXPONENT` before signing and rejects the request if they differ, because a signature made with a key the certificate does not belong to is emitted successfully and only fails later, when a reader validates the document.

## Signing requests

Signing works exactly as with SoftHSM. Set `signMethod` to `hsm` in your `signingToken`, as shown under [HSM Signing Examples](#hsm-signing-examples).

## Timeouts

Document Engine gives the signing service `SIGNING_SERVICE_TIMEOUT` milliseconds to answer, which defaults to 5000. This example connects to the HSM for each signing request, and a connection that cannot be established is retried before it fails, which takes considerably longer than that. When the cluster is unreachable, Document Engine therefore reports a timeout well before the signing service reports why it failed — read the signing service's own logs for the cause. Measure a signing request against your own cluster and raise `SIGNING_SERVICE_TIMEOUT` if it does not comfortably fit.

# Signing via GlobalTrust eSigning API

> ℹ️ [Source code](lib/examples/globaltrust-example.js)

## Setup

To sign your documents via [GlobalTrust eSigning API](https://globaltrust.eu/en/trust2go/) example, you'll need to configure API's authentication credentials to use for HTTP BasicAuth before starting the example:

```sh
export T2GO_USER=<REPLACE WITH YOUR USER NAME>
export T2GO_PASSWORD=<REPLACE WITH YOUR PASSWORD>

docker compose up
```

## Usage

This example shows how to implement signing via a 3rd party signing API provided by [GlobalTrust](https://globaltrust.eu/en/trust2go/).

For more details about GlobalTrust's Trust2Go API, refer to its OpenAPI [reference](https://t2g.globaltrust.eu/trust2go/swagger-ui/index.html#/).


To sign with this example, set `signMethod` to `globaltrust` inside your `signingToken`:

```
curl -X 'POST' 'http://localhost:5000/api/documents/my-document-id/sign' \
  -H 'Accept: application/json' \
  -H 'Authorization: Token token="secret"' \
  -H 'Content-Type: application/json' \
  -d '{
     "signatureContainer": "raw",
     "signatureType": "cades",
     "signingToken": "{\"userId\": \"user-1-with-rights\", \"signMethod\": \"globaltrust\"}"
  }'
```

# Signing via GlobalSign DSS

> ℹ️ [Source code](lib/examples/globalsign-example.js)

## Setup

To sign your documents via [GlobalSign DSS](https://www.globalsign.com/en/digital-signing-service) example, you'll need to configure the following credentials:

- API Key
- API Secret
- TLS Certificate Chain (in PEM format)
- TLS Certificate Private Key (in PEM format)

```sh
export GLOBALSIGN_API_KEY=<REPLACE WITH YOUR GLOBALSIGN API KEY>
export GLOBALSIGN_API_SECRET=<REPLACE WITH YOUR GLOBALSIGN API SECRET>
export GLOBALSIGN_TLS_CERT=<REPLACE WITH YOUR GLOBALSIGN TLS CERTIFICATE CHAIN>
export GLOBALSIGN_TLS_KEY=<REPLACE WITH YOUR GLOBALSIGN TLS CERTIFICATE PRIVATE KEY>

docker compose up
```

## Usage

This example shows how to implement signing via a 3rd party signing API provided by [GlobalSign](https://www.globalsign.com/en/digital-signing-service).

For more details about GlobalSign's Digital Signing Service API, refer to its [reference](https://www.globalsign.com/en/resources/apis/api-documentation/digital-signing-service-api-documentation.html#).


To sign with this example, set `signMethod` to `globalsign` inside your `signingToken`:

```
curl -X 'POST' 'http://localhost:5000/api/documents/my-document-id/sign' \
  -H 'Accept: application/json' \
  -H 'Authorization: Token token="secret"' \
  -H 'Content-Type: application/json' \
  -d '{
     "signatureContainer": "raw",
     "signatureType": "cades",
     "signingToken": "{\"userId\": \"user-1-with-rights\", \"signMethod\": \"globalsign\"}"
  }'
```

# PSPDFKit Server Signing Service Example

This application implements a signing service compatible with PSPDFKit Server and its digital signatures signing API in Node JS.

## Support, Issues and License Questions

PSPDFKit offers support for customers with an active SDK license via https://pspdfkit.com/support/request/

Are you [evaluating our SDK](https://pspdfkit.com/try/)? That's great, we're happy to help out! To make sure this is fast, please use a work email and have someone from your company fill out our sales form: https://pspdfkit.com/sales/

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

With Docker Compose, it can be setup along PSPDFKit Server as:

```
services:
  signing_service:
    build: .
    environment:
      SIGNING_SERVICE_PORT: 6000
    ports:
      - 6000:6000
  pspdfkit:
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

The application exposes the `/sign` endpoint. It expects a JSON-encoded `POST` request containing three parameters:

- The _base64 encoded contents_ of the file to sign: this represents the portion
  of the PDF document that is covered by the digital signature minus the byte
  range that will contain the signature itself. Note that being base64 encoded,
  you will need to decode it before signing it.
- The _digest_ for the contents to be signed (with the hash calculated before
  contents are encoded to base64). If your language and encryption libraries
  support it, you can perform the signature operation using the hash as
  signature contents: in that case, please make sure you configure PSPDFKit
  Server to use at least `sha256` as hashing algorithm.
- The _signing token_, which can be used for authentication/authorization or request verification. Its value is determined by the original API call that would trigger the request to the signing service.

For example, you can use PSPDFKit Server's API to sign document `my-document`:

```
POST http://pspdfkit-server:5000/api/documents/my-document/sign
Authorization: Token token="<secret token>"
Content-Type: application/json

{
  "signingToken" : "user-1-with-rights"
}
```

The request contains a `signingToken` attribute whose value is entirely under your control. The example in this repository shows how you can potentially use it to forward an authentication and authorization token that the signing service uses to determine if the caller of the API has enough rights to perform the signature.

Under the hood, PSPDFKit Server will call the signing service with the following request:

```
POST http://signing-server:6000/sign
Content-Type: application/json

{
  "encoded_contents" : "CkVudW1lcmF0aW5nIG9iamVjdHM6IDExLCBkb25lLgpDb3VudGluZyBvYmplY3RzOiAxMDAlICg...",
  "digest" : "aab7fe5d814e7e8048275d19693435013727ee8002b85ba8edc29321fc2edfc9",
  "signing_token" : "user-1-with-rights"
}
```

The signing server is responsible to produce a valid PCKS7 signature container, encoded in DER format and return it as a response body with status `200`.

If the signing server responds with an error in the `4xx` range, PSPDFKit Server will fail the original request with a `400` error, logging the response received by the signing server.

The example has a few tests in the `__tests__` directory and it includes a fixture file that represents valid contents to be signed and named after its sha256 hash. You can use it to replicate a correct signing flow in another programming language.

# Interact via curl

```
curl http://localhost:6000/sign \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"document_digest" : "<content-hash>", "encoded_contents" : "<base64-encoded-contents>", "signing_token" : "user-1-with-rights"}'
```

## Verify the returned PKCS7

```
curl http://localhost:6000/sign \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"document_digest" : "<content-hash>", "encoded_contents" : "<base64-encoded-contents>", "signing_token" : "user-1-with-rights"}'
  | openssl pkcs7 -noout -text -print
```

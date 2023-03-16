# Setting up Certification Authority and signing certificate for testing purposes

## Prerequisites

This should work on any modern Mac or Linux system with OpenSSL or LibreSSL installed.

### OpenSSL on macOS

OpenSSL implementation (more specifically, [LibreSSL](https://www.libressl.org/)) is included in macOS, but default configuration does not include relevant options for Certification Authority generation.

We know three ways of solving that.

#### Option 1: updating system configuration

Following the [recommendation from Michael MacFadden](https://github.com/cert-manager/cert-manager/issues/279#issuecomment-365827793), add the following lines to `/etc/ssl/openssl.cnf`:

```
[ v3_ca ]
basicConstraints = critical,CA:TRUE
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer:always
```

#### Option 2: running OpenSSL from a container

If you use [Docker](https://www.docker.com/) or another container engine, OpenSSL operations can be wrapped in any container that includes fresh OpenSSL for Linux, e.g. [nginx](https://hub.docker.com/_/nginx):

```
docker run --rm -it \
  -v "$PWD:/working-directory" -w "/working-directory" \
  nginx:latest \
  openssl <...>
```

#### Option 3: fully custom OpenSSL with HomeBrew

If you are using [HomeBrew](https://brew.sh/), the corresponding [formula](https://formulae.brew.sh/formula/openssl@3) may be used:

```
brew install openssl@3
```

## 1. Prepare Certification Authority

Generate CA private key:

```
openssl genrsa -out test-ca.key 2048
```

This will create file `test-ca.key` which will be required on the next steps. 

Generate self signed CA certificate valid for ten years:

```
openssl req \
  -x509 -new -nodes -key test-ca.key \
  -subj "/CN=My Test CA v1" \
  -days 3650 -reqexts v3_req -extensions v3_ca \
  -out test-ca.cert
```

Please note the `CN` (*common name*) parameter: it will be the name of the CA. File `test-ca.cert` will be [root CA](https://en.wikipedia.org/wiki/Root_certificate) in our setup.

## 2. Request and sign a signing certificate

The following command will generate a certificate request and a private key. Like with CA, `CN` parameter should be defined by the user convenience, it will be used to identify the signing entity:

```
openssl req \
  -utf8 -nameopt oneline,utf8 -new -newkey rsa:2048 -nodes \
  -subj "/CN=My Testing Document Signer" \
  -keyout test-signer.key -out test-signer.csr
```

Sign a certificate using `test-signer.csr` and CA private key and certificate created earlier:

```
openssl x509 \
  -days 365 \
  -CA test-ca.cert -CAkey test-ca.key -CAcreateserial \
  -in test-signer.csr -req \
  -out test-signer.cert
```

We now have three useful files:

* `test-ca.cert`: this is our CA certificate, forming the whole CA chain.
* `test-signer.cert`: this is the certificate to be used to sign documents.
* `test-signer.key`: private key of the signer certificate.


## 3. Verify the generated certificates

CA: 

```
openssl x509 -text -noout -in test-ca.cert 
```

The output should include:

```
Certificate:
    Data:
        Version: 3 (0x2)
...
    Signature Algorithm: sha256WithRSAEncryption
        Issuer: CN=My Test CA v1
...
        Subject: CN=My Test CA v1
        X509v3 extensions:
...
            X509v3 Basic Constraints: critical
                CA:TRUE
```

Signing certificate:

```
openssl x509 -text -noout -in test-signer.cert
```

Expected output:

```
Certificate:
    Data:
        Version: 1 (0x0)
    Signature Algorithm: sha256WithRSAEncryption
        Issuer: CN=My Test CA v1
        Subject: CN=My Testing Document Signer
```

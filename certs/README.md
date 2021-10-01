# Signing certificate setup

This has been tested on a Mac:

```
Darwin mini.local 18.7.0 Darwin Kernel Version 18.7.0: Tue Aug 20 16:57:14 PDT 2019; root:xnu-4903.271.2~2/RELEASE_X86_64 x86_64
```

With `openssl` version:

```
LibreSSL 2.6.5
```

## 1. Generate a certificate

We start by generating a self-signed certificate. Note that the certificate includes the "Digital Signature" X509v3 extension.

This command also generates a private key as part of the process.

```
openssl req \
  -newkey rsa:2048 \
  -nodes \
  -keyout private-key.pem \
  -x509 \
  -days 365 \
  -extensions v3_req \
  -config /usr/local/etc/openssl/openssl.cnf \
  -out certificate.pem
```

Fill the certificate data as preferred.

## 2. Verify the generated certificate is correct

```
openssl x509 -text -noout -in certificate.pem
```

If everything is correct, you should see these extensions:

```
X509v3 extensions:
    X509v3 Basic Constraints:
        CA:FALSE
    X509v3 Key Usage:
        Digital Signature, Non Repudiation, Key Encipherment
```

## 3. Bundle certificate as a PKCS7 container

Optional, pem should already be usable.

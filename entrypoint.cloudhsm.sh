#!/bin/sh

# /bin/sh is dash here, which has no pipefail.
set -eu

: ${SIGNING_SERVICE_PORT:=6000}
export SIGNING_SERVICE_PORT

: ${HSM_MODULE:=/opt/cloudhsm/lib/libcloudhsm_pkcs11.so}
export HSM_MODULE

: ${HSM_LOG_LEVEL:=info}

if [ -z "${HSM_PIN:-}" ]; then
  echo "HSM_PIN must hold the crypto user credentials as user:password." >&2
  exit 1
fi
export HSM_PIN

if [ -z "${HSM_CA_CERT:-}" ]; then
  echo "HSM_CA_CERT must point to the cluster certificate that signed the HSM's identity." >&2
  exit 1
fi

# configure-pkcs11 accepts a --hsm-ca-cert path that does not exist and still exits 0,
# so the file is checked here instead of relying on that exit status.
if [ ! -f "${HSM_CA_CERT}" ]; then
  echo "HSM_CA_CERT points to ${HSM_CA_CERT}, which is not a file." >&2
  exit 1
fi

# This image ships no test certificates, so the signing defaults resolve to files that do
# not exist. Unchecked, the container starts healthy and every signing request fails.
if [ -z "${HSM_SIGNER_CERTIFICATE:-}" ] || [ -z "${HSM_CA_CERTIFICATES:-}" ]; then
  echo "HSM_SIGNER_CERTIFICATE and HSM_CA_CERTIFICATES must point to the certificate issued for the signing key and to its chain." >&2
  exit 1
fi
export HSM_SIGNER_CERTIFICATE HSM_CA_CERTIFICATES

if [ ! -f "${HSM_SIGNER_CERTIFICATE}" ]; then
  echo "HSM_SIGNER_CERTIFICATE points to ${HSM_SIGNER_CERTIFICATE}, which is not a file." >&2
  exit 1
fi

# Split the chain on its comma only. Splitting on whitespace would break a path that
# contains a space, and leaving globbing on could expand one into a different file.
chain_length=0

set -f
IFS=,
for certificate in ${HSM_CA_CERTIFICATES}; do
  # The application trims surrounding whitespace and drops empty entries, so startup
  # accepts exactly the values it does.
  certificate=$(printf '%s' "${certificate}" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')

  if [ -z "${certificate}" ]; then
    continue
  fi

  if [ ! -f "${certificate}" ]; then
    echo "HSM_CA_CERTIFICATES lists ${certificate}, which is not a file." >&2
    exit 1
  fi

  chain_length=$((chain_length + 1))
done
unset IFS
set +f

if [ "${chain_length}" -eq 0 ]; then
  echo "HSM_CA_CERTIFICATES lists no certificate." >&2
  exit 1
fi

# The cluster ID only discovers the HSM addresses. The cluster certificate is a separate
# prerequisite either way, and discovery additionally needs credentials and a region.
if [ -n "${HSM_CLUSTER_ID:-}" ]; then
  set -- --cluster-id "${HSM_CLUSTER_ID}"

  if [ -n "${AWS_REGION:-}" ]; then
    set -- "$@" --region "${AWS_REGION}"
  fi
elif [ -n "${HSM_IP_ADDRESS:-}" ]; then
  set -- -a "${HSM_IP_ADDRESS}"
else
  echo "Set HSM_CLUSTER_ID to discover the cluster, or HSM_IP_ADDRESS to name one HSM directly." >&2
  exit 1
fi

# The shipped configuration logs to a file under /opt/cloudhsm/run, which a container
# scheduler does not collect and the task may not be able to write.
/opt/cloudhsm/bin/configure-pkcs11 "$@" \
  --hsm-ca-cert "${HSM_CA_CERT}" \
  --log-type term \
  --log-level "${HSM_LOG_LEVEL}"

# Start the app.
node "index.js"

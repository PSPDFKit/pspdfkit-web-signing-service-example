FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# graphene-pk11 needs to build its native components, install all the dependencies before fetching npm dependencies.
RUN apk add --no-cache python3 make g++ && \
    npm ci --only=production && \
    apk del python3 make g++

COPY . /app
COPY entrypoint.sh /app/entrypoint.sh

# Generate example certificates.
RUN apk add --no-cache openssl && \
    cd ./certs && \
    chmod +x ./generate-certificates.sh && \
    ./generate-certificates.sh && \
    rm ./generate-certificates.sh
RUN rm README.md && rm certs/README.md

# We use SoftHSMv2 (https://github.com/opendnssec/SoftHSMv2) as a software HSM for the purposes of this example.
RUN apk add --no-cache softhsm dumb-init

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["./entrypoint.sh"]

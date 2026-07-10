FROM golang:1.24-alpine AS policy-builder
WORKDIR /src
COPY infra/relay-policy/main.go .
RUN CGO_ENABLED=0 go build -o /strfry-policy main.go

FROM docker.io/dockurr/strfry@sha256:083d8941253ade7637ad6f15afd768633cea8573efea86b430539622576614f3
COPY --from=policy-builder /strfry-policy /usr/local/bin/strfry-policy

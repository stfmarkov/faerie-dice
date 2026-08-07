# Frontend assets (Vite)
FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

# Go binary
FROM golang:1.22-alpine AS backend
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY cmd ./cmd
RUN CGO_ENABLED=0 go build -o /server ./cmd/server

# Runtime
FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY --from=backend /server ./server
COPY --from=frontend /app/dist ./dist
COPY templates ./templates
ENV PORT=8080
EXPOSE 8080
CMD ["./server"]

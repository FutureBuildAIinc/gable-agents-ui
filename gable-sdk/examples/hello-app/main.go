// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

// Command hello-app is a complete, runnable host for one third-party app.
//
// It is the smallest thing that proves the connector seam stands on its own:
// an app (app.go) that knows nothing about the host, a host (host.go) that
// knows nothing about the app beyond the [apps.App] it was handed, and the SDK
// between them. Nothing outside the standard library is imported.
//
// Run it:
//
//	go run ./examples/hello-app
//
// Then, in another shell:
//
//	curl localhost:8080/api/v1/hello/ada
//	  {"message":"Hello, ada!"}
//
//	curl localhost:8080/api/v1/apps
//	  {"apps":[{"key":"hello",…,"enabled":true}]}
//
//	curl -XPOST -H 'X-Demo-Role: admin' localhost:8080/api/v1/apps/hello/disable
//	curl localhost:8080/api/v1/hello/ada
//	  {"error":{"code":"app_disabled",…}}
//
//	curl -XPOST -H 'X-Demo-Role: admin' localhost:8080/api/v1/apps/hello/enable
//
// Enablement lives in memory here, so it resets when the process does. That is
// the one thing a real host must replace: see the apps.Store port.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"time"
)

// addr is where the demo listens. Override with HELLO_ADDR.
const defaultAddr = "127.0.0.1:8080"

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	h, err := newHost(ctx, logger)
	cancel()
	if err != nil {
		logger.Error("hello-app: startup failed", "error", err)
		os.Exit(1)
	}

	addr := os.Getenv("HELLO_ADDR")
	if addr == "" {
		addr = defaultAddr
	}
	server := &http.Server{
		Addr:              addr,
		Handler:           h.mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	logger.Info("hello-app: listening", "addr", addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("hello-app: server stopped", "error", err)
		os.Exit(1)
	}
}

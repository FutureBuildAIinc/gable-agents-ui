// SPDX-License-Identifier: LicenseRef-OpenLBM-Connector-1.0
// SPDX-FileCopyrightText: 2026 FutureBuild, Inc. and OpenLBM contributors

package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/FutureBuildAIinc/gable-sdk/apps"
)

// This file is the part a third party writes: a manifest, some state, some
// handlers, and one function that hands the host an [apps.App]. It imports the
// SDK and the standard library. It does not import the host, and the host does
// not import it — the only thing that crosses the seam is the App value.

// helloManifest is the app's declared identity: what the host stores, what the
// Apps page renders, and what an operator toggles.
var helloManifest = apps.Manifest{
	Key:      "hello",
	Name:     "Hello",
	Summary:  "Greets whoever asks. The smallest complete app.",
	Category: "Examples",
}

// greeter is the app's own state. The SDK has no opinion about it: an app owns
// its storage, its dependencies, and its middleware, and the seam never sees
// any of them.
type greeter struct {
	mu       sync.RWMutex
	greeting string
}

func newGreeter(greeting string) *greeter {
	return &greeter{greeting: greeting}
}

// App returns the value the host adds to its registry. Exposing the app as one
// constructed value — rather than a package-level var the host must wire by
// hand — is what lets an app take its own dependencies (a database handle, a
// client, a config struct) without the host knowing about them.
func (g *greeter) App() apps.App {
	return apps.App{
		Manifest: helloManifest,
		Register: func(r apps.Router) {
			// Two routes registered two ways, because [apps.Router] offers
			// exactly these two methods and an app may use either.
			r.HandleFunc("GET /api/v1/hello/{name}", g.handleGreet)
			r.Handle("PUT /api/v1/hello/greeting", http.HandlerFunc(g.handleSetGreeting))
		},
	}
}

// handleGreet answers GET /api/v1/hello/{name}.
func (g *greeter) handleGreet(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(r.PathValue("name"))
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	g.mu.RLock()
	greeting := g.greeting
	g.mu.RUnlock()
	writeJSON(w, http.StatusOK, greetResponse{Message: greeting + ", " + name + "!"})
}

// handleSetGreeting answers PUT /api/v1/hello/greeting.
func (g *greeter) handleSetGreeting(w http.ResponseWriter, r *http.Request) {
	var req setGreetingRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body must be JSON"})
		return
	}
	if strings.TrimSpace(req.Greeting) == "" {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "greeting is required"})
		return
	}
	g.mu.Lock()
	g.greeting = strings.TrimSpace(req.Greeting)
	greeting := g.greeting
	g.mu.Unlock()
	writeJSON(w, http.StatusOK, setGreetingRequest{Greeting: greeting})
}

type greetResponse struct {
	Message string `json:"message"`
}

type setGreetingRequest struct {
	Greeting string `json:"greeting"`
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

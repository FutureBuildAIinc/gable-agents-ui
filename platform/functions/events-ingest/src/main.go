package handler

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	openruntimes "github.com/open-runtimes/types-for-go/v4/openruntimes"
)

// events-ingest receives domain events from gable's eventpub over HTTP and
// writes them as documents to the Appwrite `events` collection (ADR 0001).
// The document write itself fires the fanout trigger and Realtime.
//
// Env:
//   EVENTS_INGEST_KEY     scoped key gable sends as X-Events-Key (required)
//   APPWRITE_ENDPOINT     e.g. https://api.futurebuild.ai (required)
//   APPWRITE_PROJECT_ID   project owning the collection (required)
//   APPWRITE_API_KEY      server key with databases.write on the events collection (required)
//   APPWRITE_DATABASE     default "platform"
//   APPWRITE_COLLECTION   default "events"

type envelope struct {
	ID       string                 `json:"id"`
	Type     string                 `json:"type"`
	Org      string                 `json:"org"`
	BranchID string                 `json:"branchId,omitempty"`
	Entity   entityRef              `json:"entity"`
	Data     map[string]interface{} `json:"data,omitempty"`
	At       string                 `json:"at"`
}

type entityRef struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

var typePattern = regexp.MustCompile(`^[a-z_]+\.[a-z_]+$`)

func validate(e *envelope) error {
	if e.Type == "" || !typePattern.MatchString(e.Type) {
		return fmt.Errorf("type must match <entity>.<verb>, got %q", e.Type)
	}
	if e.Org == "" {
		return fmt.Errorf("org is required")
	}
	if e.Entity.Kind == "" || e.Entity.ID == "" {
		return fmt.Errorf("entity.kind and entity.id are required")
	}
	return nil
}

func newUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func Main(Context openruntimes.Context) openruntimes.Response {
	ingestKey := os.Getenv("EVENTS_INGEST_KEY")
	endpoint := strings.TrimRight(os.Getenv("APPWRITE_ENDPOINT"), "/")
	project := os.Getenv("APPWRITE_PROJECT_ID")
	apiKey := os.Getenv("APPWRITE_API_KEY")
	database := envOr("APPWRITE_DATABASE", "platform")
	collection := envOr("APPWRITE_COLLECTION", "events")

	if ingestKey == "" || endpoint == "" || project == "" || apiKey == "" {
		Context.Error("missing required env (EVENTS_INGEST_KEY, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY)")
		return Context.Res.Json(map[string]interface{}{"error": "misconfigured function"}, Context.Res.WithStatusCode(500))
	}

	if Context.Req.Method != http.MethodPost {
		return Context.Res.Json(map[string]interface{}{"error": "POST only"}, Context.Res.WithStatusCode(405))
	}
	if got := Context.Req.Headers["x-events-key"]; got == "" || got != ingestKey {
		return Context.Res.Json(map[string]interface{}{"error": "unauthorized"}, Context.Res.WithStatusCode(401))
	}

	var e envelope
	if err := Context.Req.BodyJson(&e); err != nil {
		return Context.Res.Json(map[string]interface{}{"error": "invalid JSON body"}, Context.Res.WithStatusCode(400))
	}
	if err := validate(&e); err != nil {
		return Context.Res.Json(map[string]interface{}{"error": err.Error()}, Context.Res.WithStatusCode(400))
	}
	if e.ID == "" {
		e.ID = newUUID()
	}
	if e.At == "" {
		e.At = time.Now().UTC().Format(time.RFC3339)
	}

	// Flatten for collection storage (attributes are scalar; data stays a JSON string).
	dataJSON, _ := json.Marshal(e.Data)
	doc := map[string]interface{}{
		"eventId":    e.ID,
		"type":       e.Type,
		"org":        e.Org,
		"branchId":   e.BranchID,
		"entityKind": e.Entity.Kind,
		"entityId":   e.Entity.ID,
		"data":       string(dataJSON),
		"at":         e.At,
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"documentId": "unique()",
		"data":       doc,
	})

	url := fmt.Sprintf("%s/v1/databases/%s/collections/%s/documents", endpoint, database, collection)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		Context.Error("request build failed: " + err.Error())
		return Context.Res.Json(map[string]interface{}{"error": "internal"}, Context.Res.WithStatusCode(500))
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-appwrite-project", project)
	req.Header.Set("x-appwrite-key", apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		Context.Error("appwrite write failed: " + err.Error())
		return Context.Res.Json(map[string]interface{}{"error": "appwrite unreachable"}, Context.Res.WithStatusCode(502))
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		Context.Error(fmt.Sprintf("appwrite write status %d: %s", resp.StatusCode, string(respBody)))
		return Context.Res.Json(map[string]interface{}{"error": "appwrite write failed"}, Context.Res.WithStatusCode(502))
	}

	Context.Log(fmt.Sprintf("ingested %s %s/%s (%s)", e.Type, e.Entity.Kind, e.Entity.ID, e.ID))
	return Context.Res.Json(map[string]interface{}{"ok": true, "id": e.ID}, Context.Res.WithStatusCode(201))
}

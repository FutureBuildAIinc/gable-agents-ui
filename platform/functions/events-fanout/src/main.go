package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	openruntimes "github.com/open-runtimes/types-for-go/v4/openruntimes"
)

// events-fanout fires on `databases.platform.collections.events.documents.*.create`.
// It delivers the event to registered subscriber webhooks with bounded retries.
// Realtime delivery needs no code: Appwrite emits document-create on the
// collection channel automatically; clients subscribe to
// `databases.platform.collections.events.documents` (see platform/README.md).
//
// Env:
//   SUBSCRIBER_WEBHOOKS  JSON array: [{"url":"https://app.example/hook","key":"bearer","types":["quote.","order."]}]
//                        `types` is an optional prefix filter; omitted = all events.

type subscriber struct {
	URL   string   `json:"url"`
	Key   string   `json:"key,omitempty"`
	Types []string `json:"types,omitempty"`
}

func matches(s subscriber, eventType string) bool {
	if len(s.Types) == 0 {
		return true
	}
	for _, prefix := range s.Types {
		if strings.HasPrefix(eventType, prefix) {
			return true
		}
	}
	return false
}

func deliver(s subscriber, payload []byte) error {
	var lastErr error
	for attempt, delay := range []time.Duration{0, time.Second, 5 * time.Second} {
		if delay > 0 {
			time.Sleep(delay)
		}
		req, err := http.NewRequest(http.MethodPost, s.URL, bytes.NewReader(payload))
		if err != nil {
			return err
		}
		req.Header.Set("content-type", "application/json")
		if s.Key != "" {
			req.Header.Set("authorization", "Bearer "+s.Key)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		if resp.StatusCode < 300 {
			return nil
		}
		lastErr = fmt.Errorf("status %d", resp.StatusCode)
		_ = attempt
	}
	return lastErr
}

func Main(Context openruntimes.Context) openruntimes.Response {
	var doc struct {
		EventID string `json:"eventId"`
		Type    string `json:"type"`
		Org     string `json:"org"`
	}
	if err := Context.Req.BodyJson(&doc); err != nil || doc.Type == "" {
		// Non-document invocation (manual test run) — acknowledge without work.
		Context.Log("no event document in payload; nothing to fan out")
		return Context.Res.Json(map[string]interface{}{"ok": true, "delivered": 0})
	}

	var subscribers []subscriber
	if raw := os.Getenv("SUBSCRIBER_WEBHOOKS"); raw != "" {
		if err := json.Unmarshal([]byte(raw), &subscribers); err != nil {
			Context.Error("SUBSCRIBER_WEBHOOKS is not valid JSON: " + err.Error())
			return Context.Res.Json(map[string]interface{}{"error": "misconfigured"}, Context.Res.WithStatusCode(500))
		}
	}

	payload := Context.Req.BodyBinary()
	delivered, failed := 0, 0
	for _, s := range subscribers {
		if !matches(s, doc.Type) {
			continue
		}
		if err := deliver(s, payload); err != nil {
			failed++
			Context.Error(fmt.Sprintf("deliver %s to %s failed: %v", doc.EventID, s.URL, err))
		} else {
			delivered++
		}
	}

	Context.Log(fmt.Sprintf("fanout %s (%s): %d delivered, %d failed", doc.EventID, doc.Type, delivered, failed))
	return Context.Res.Json(map[string]interface{}{"ok": failed == 0, "delivered": delivered, "failed": failed})
}

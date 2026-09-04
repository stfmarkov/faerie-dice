package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFeedbackPostForwardsPayloadAndSecret(t *testing.T) {
	var gotKey, gotContentType string
	var gotBody feedbackRequest
	var extra map[string]json.RawMessage

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.Header.Get("X-Feedback-Key")
		gotContentType = r.Header.Get("Content-Type")
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("read upstream body: %v", err)
			http.Error(w, "nope", http.StatusInternalServerError)
			return
		}
		if err := json.Unmarshal(raw, &gotBody); err != nil {
			t.Errorf("decode upstream body: %v", err)
		}
		if err := json.Unmarshal(raw, &extra); err != nil {
			t.Errorf("decode extra fields: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	cfg := feedbackConfig{
		Endpoint: upstream.URL,
		Key:      "secret-test-key",
		Client:   upstream.Client(),
	}

	body := `{"name":"Ada","email":"ada@example.com","message":"Loved the new screen.","rating":5,"evil":true}`
	req := httptest.NewRequest(http.MethodPost, "/feedback", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Feedback-Key", "forged")
	rec := httptest.NewRecorder()

	cfg.handlePost(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if gotKey != "secret-test-key" {
		t.Fatalf("upstream key = %q, want secret-test-key", gotKey)
	}
	if !strings.HasPrefix(gotContentType, "application/json") {
		t.Fatalf("upstream content-type = %q", gotContentType)
	}
	if rec.Header().Get("X-Feedback-Key") != "" {
		t.Fatal("response leaked X-Feedback-Key")
	}
	if strings.Contains(rec.Body.String(), "secret-test-key") {
		t.Fatal("response leaked the key")
	}
	if _, ok := extra["evil"]; ok {
		t.Fatal("forwarded unexpected extra field")
	}
	want := feedbackRequest{Name: "Ada", Email: "ada@example.com", Message: "Loved the new screen.", Rating: 5}
	if gotBody != want {
		t.Fatalf("upstream body = %+v, want %+v", gotBody, want)
	}

	var resp feedbackOKBody
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.OK {
		t.Fatal("expected ok true")
	}
}

func TestFeedbackPostNotConfigured(t *testing.T) {
	cfg := feedbackConfig{Client: &http.Client{}}
	req := httptest.NewRequest(http.MethodPost, "/feedback", strings.NewReader(`{"name":"Ada","email":"ada@example.com","message":"hi","rating":5}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	cfg.handlePost(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "X-Feedback-Key") {
		t.Fatal("error response mentioned the secret header")
	}
}

func TestFeedbackPostValidation(t *testing.T) {
	cfg := feedbackConfig{
		Endpoint: "http://example.invalid",
		Key:      "secret-test-key",
		Client:   &http.Client{},
	}

	cases := []struct {
		name string
		body string
	}{
		{name: "missing name", body: `{"name":"","email":"ada@example.com","message":"hi","rating":5}`},
		{name: "bad email", body: `{"name":"Ada","email":"not-an-email","message":"hi","rating":5}`},
		{name: "missing message", body: `{"name":"Ada","email":"ada@example.com","message":"","rating":5}`},
		{name: "rating low", body: `{"name":"Ada","email":"ada@example.com","message":"hi","rating":0}`},
		{name: "rating high", body: `{"name":"Ada","email":"ada@example.com","message":"hi","rating":6}`},
		{name: "invalid json", body: `{`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/feedback", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			cfg.handlePost(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400, body = %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestFeedbackPostUpstreamFailure(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusInternalServerError)
	}))
	defer upstream.Close()

	cfg := feedbackConfig{
		Endpoint: upstream.URL,
		Key:      "secret-test-key",
		Client:   upstream.Client(),
	}

	req := httptest.NewRequest(http.MethodPost, "/feedback", strings.NewReader(`{"name":"Ada","email":"ada@example.com","message":"Loved the new screen.","rating":5}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	cfg.handlePost(rec, req)

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502, body = %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "secret-test-key") || strings.Contains(rec.Body.String(), upstream.URL) {
		t.Fatal("error response leaked upstream details")
	}
}

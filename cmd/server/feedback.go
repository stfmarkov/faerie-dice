package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	feedbackMaxBodyBytes = 8 << 10
	feedbackMaxNameRunes = 100
	feedbackMaxMessage   = 2000
	feedbackTimeout      = 10 * time.Second
)

type feedbackConfig struct {
	Endpoint string
	Key      string
	Client   *http.Client
}

type feedbackRequest struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Message string `json:"message"`
	Rating  int    `json:"rating"`
}

type feedbackErrorBody struct {
	Error string `json:"error"`
}

type feedbackOKBody struct {
	OK bool `json:"ok"`
}

func loadFeedbackConfig() feedbackConfig {
	cfg := feedbackConfig{
		Endpoint: strings.TrimSpace(os.Getenv("FEEDBACK_ENDPOINT")),
		Key:      strings.TrimSpace(os.Getenv("FEEDBACK_KEY")),
		Client:   &http.Client{Timeout: feedbackTimeout},
	}
	if !cfg.ready() {
		log.Printf("feedback proxy disabled: set FEEDBACK_ENDPOINT and FEEDBACK_KEY in the environment or .env")
		return cfg
	}
	parsed, err := url.Parse(cfg.Endpoint)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		log.Printf("feedback proxy disabled: FEEDBACK_ENDPOINT is not a valid http(s) URL")
		cfg.Endpoint = ""
		cfg.Key = ""
		return cfg
	}
	log.Printf("feedback proxy enabled")
	return cfg
}

func (c feedbackConfig) ready() bool {
	return c.Endpoint != "" && c.Key != ""
}

func (c feedbackConfig) handlePost(w http.ResponseWriter, r *http.Request) {
	if !c.ready() {
		writeFeedbackJSON(w, http.StatusServiceUnavailable, feedbackErrorBody{Error: "feedback is not configured"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, feedbackMaxBodyBytes)
	defer r.Body.Close()

	var payload feedbackRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeFeedbackJSON(w, http.StatusBadRequest, feedbackErrorBody{Error: "invalid json"})
		return
	}
	payload.normalize()
	if msg := payload.validate(); msg != "" {
		writeFeedbackJSON(w, http.StatusBadRequest, feedbackErrorBody{Error: msg})
		return
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("feedback marshal error: %v", err)
		writeFeedbackJSON(w, http.StatusInternalServerError, feedbackErrorBody{Error: "could not send feedback"})
		return
	}

	upstream, err := http.NewRequestWithContext(r.Context(), http.MethodPost, c.Endpoint, bytes.NewReader(body))
	if err != nil {
		log.Printf("feedback request error: %v", err)
		writeFeedbackJSON(w, http.StatusInternalServerError, feedbackErrorBody{Error: "could not send feedback"})
		return
	}
	upstream.Header.Set("Content-Type", "application/json")
	upstream.Header.Set("X-Feedback-Key", c.Key)

	resp, err := c.Client.Do(upstream)
	if err != nil {
		log.Printf("feedback upstream error: %v", err)
		writeFeedbackJSON(w, http.StatusBadGateway, feedbackErrorBody{Error: "could not send feedback"})
		return
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("feedback upstream status %d", resp.StatusCode)
		writeFeedbackJSON(w, http.StatusBadGateway, feedbackErrorBody{Error: "could not send feedback"})
		return
	}

	writeFeedbackJSON(w, http.StatusOK, feedbackOKBody{OK: true})
}

func (f *feedbackRequest) normalize() {
	f.Name = strings.TrimSpace(f.Name)
	f.Email = strings.TrimSpace(f.Email)
	f.Message = strings.TrimSpace(f.Message)
}

func (f feedbackRequest) validate() string {
	if f.Name == "" {
		return "name is required"
	}
	if utf8.RuneCountInString(f.Name) > feedbackMaxNameRunes {
		return "name is too long"
	}
	if f.Email == "" {
		return "email is required"
	}
	if !validFeedbackEmail(f.Email) {
		return "email is invalid"
	}
	if f.Message == "" {
		return "message is required"
	}
	if utf8.RuneCountInString(f.Message) > feedbackMaxMessage {
		return "message is too long"
	}
	if f.Rating < 1 || f.Rating > 5 {
		return "rating must be 1 to 5"
	}
	return ""
}

func validFeedbackEmail(value string) bool {
	if utf8.RuneCountInString(value) > 254 {
		return false
	}
	addr, err := mail.ParseAddress(value)
	return err == nil && addr.Address == value
}

func writeFeedbackJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("feedback response error: %v", err)
	}
}

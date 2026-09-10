package main

import (
	"encoding/json"
	"html/template"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestParsePublicOrigin(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", ""},
		{"  https://example.com/  ", "https://example.com"},
		{"http://localhost:8888", "http://localhost:8888"},
		{"ftp://example.com", ""},
		{"https://example.com/app", ""},
		{"https://example.com?q=1", ""},
		{"not-a-url", ""},
	}
	for _, tc := range cases {
		if got := parsePublicOrigin(tc.in); got != tc.want {
			t.Errorf("parsePublicOrigin(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestForPageCanonicalAndJSONLD(t *testing.T) {
	base := pageData{Origin: "https://example.com"}
	home := base.forPage(homeTitle, homeDescription, "/", true)
	if home.Canonical != "https://example.com/" {
		t.Fatalf("home canonical = %q", home.Canonical)
	}
	if home.JSONLD == "" {
		t.Fatal("expected JSON-LD on home")
	}
	var payload map[string]string
	if err := json.Unmarshal([]byte(home.JSONLD), &payload); err != nil {
		t.Fatalf("json-ld: %v", err)
	}
	if payload["@type"] != "WebApplication" {
		t.Fatalf("@type = %q", payload["@type"])
	}
	if payload["url"] != "https://example.com/" {
		t.Fatalf("url = %q", payload["url"])
	}
	if payload["description"] != homeDescription {
		t.Fatalf("description = %q", payload["description"])
	}

	explain := base.forPage(explainTitle, explainDescription, "/explain", false)
	if explain.Canonical != "https://example.com/explain" {
		t.Fatalf("explain canonical = %q", explain.Canonical)
	}
	if explain.JSONLD != "" {
		t.Fatal("explain should not have JSON-LD")
	}

	noOrigin := pageData{}.forPage(homeTitle, homeDescription, "/", true)
	if noOrigin.Canonical != "" {
		t.Fatalf("canonical without origin = %q", noOrigin.Canonical)
	}
	if !strings.Contains(string(noOrigin.JSONLD), `"@type":"WebApplication"`) {
		t.Fatalf("json-ld without origin = %s", noOrigin.JSONLD)
	}
	if strings.Contains(string(noOrigin.JSONLD), `"url"`) {
		t.Fatal("json-ld without origin should omit url")
	}
}

func TestSitemapAndRobots(t *testing.T) {
	origin := "https://example.com"
	xmlBody := sitemapXML(origin)
	for _, loc := range []string{
		"https://example.com/",
		"https://example.com/explain",
		"https://example.com/feedback",
	} {
		if !strings.Contains(xmlBody, "<loc>"+loc+"</loc>") {
			t.Fatalf("sitemap missing %s\n%s", loc, xmlBody)
		}
	}

	robots := robotsTxt(origin)
	if !strings.Contains(robots, "Sitemap: https://example.com/sitemap.xml") {
		t.Fatalf("robots missing sitemap\n%s", robots)
	}
	if !strings.Contains(robotsTxt(""), "Allow: /") {
		t.Fatal("robots without origin should still allow /")
	}
	if strings.Contains(robotsTxt(""), "Sitemap:") {
		t.Fatal("robots without origin should omit sitemap")
	}

	rec := httptest.NewRecorder()
	handleSitemap(origin).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("sitemap status = %d", rec.Code)
	}
	if !strings.Contains(rec.Header().Get("Content-Type"), "xml") {
		t.Fatalf("sitemap content-type = %q", rec.Header().Get("Content-Type"))
	}

	missing := httptest.NewRecorder()
	handleSitemap("").ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("sitemap without origin status = %d", missing.Code)
	}

	robotsRec := httptest.NewRecorder()
	handleRobots(origin).ServeHTTP(robotsRec, httptest.NewRequest(http.MethodGet, "/robots.txt", nil))
	if robotsRec.Code != http.StatusOK {
		t.Fatalf("robots status = %d", robotsRec.Code)
	}
	if !strings.Contains(robotsRec.Body.String(), "Sitemap: https://example.com/sitemap.xml") {
		t.Fatalf("robots body = %s", robotsRec.Body.String())
	}
}

func TestSEOTemplateRendersCanonicalAndJSONLD(t *testing.T) {
	tmpl, err := template.ParseFiles(filepath.Join("..", "..", "templates", "seo.html"))
	if err != nil {
		t.Fatal(err)
	}
	page := pageData{Origin: "https://example.com"}.forPage(homeTitle, homeDescription, "/", true)
	var b strings.Builder
	if err := tmpl.ExecuteTemplate(&b, "seo", page); err != nil {
		t.Fatal(err)
	}
	out := b.String()
	if !strings.Contains(out, `<title>fair(ish) dice · roller for DMs and game designers</title>`) {
		t.Fatalf("missing title\n%s", out)
	}
	if !strings.Contains(out, `content="`+homeDescription+`"`) {
		t.Fatalf("missing description\n%s", out)
	}
	if !strings.Contains(out, `<link rel="canonical" href="https://example.com/">`) {
		t.Fatalf("missing canonical\n%s", out)
	}
	if !strings.Contains(out, `property="og:title"`) {
		t.Fatalf("missing og:title\n%s", out)
	}
	start := strings.Index(out, `<script type="application/ld+json">`)
	end := strings.Index(out, `</script>`)
	if start < 0 || end < 0 || end <= start {
		t.Fatalf("missing json-ld script\n%s", out)
	}
	raw := out[start+len(`<script type="application/ld+json">`) : end]
	var payload map[string]string
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("json-ld not parseable: %v\n%s", err, raw)
	}
	if payload["@type"] != "WebApplication" {
		t.Fatalf("json-ld type = %q", payload["@type"])
	}
}

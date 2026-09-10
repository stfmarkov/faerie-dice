package main

import (
	"encoding/json"
	"encoding/xml"
	"html/template"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
)

const (
	homeTitle       = "fair(ish) dice · roller for DMs and game designers"
	homeDescription = "Roll fair dice, or Fairish dice that remember the session. Average and the probability engine help DMs and designers check encounters and dice pools."

	explainTitle       = "Fair dice, and two that aren't · fair(ish) dice"
	explainDescription = "A fair die has even odds on every face. This page is how the roller uses that, and two modes that are not fair, for DMs and designers."

	feedbackTitle       = "Feedback · fair(ish) dice"
	feedbackDescription = "Send feedback about fair(ish) dice."
)

var sitePaths = []string{"/", "/explain", "/feedback"}

func parsePublicOrigin(raw string) string {
	raw = strings.TrimRight(strings.TrimSpace(raw), "/")
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return ""
	}
	if (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return ""
	}
	return raw
}

func loadPublicOrigin() string {
	raw := os.Getenv("PUBLIC_ORIGIN")
	origin := parsePublicOrigin(raw)
	if strings.TrimSpace(raw) != "" && origin == "" {
		log.Printf("PUBLIC_ORIGIN ignored: not a valid http(s) origin")
		return ""
	}
	if origin == "" {
		log.Printf("PUBLIC_ORIGIN unset: canonical URLs and sitemap.xml disabled")
	}
	return origin
}

func (base pageData) forPage(title, description, path string, withJSONLD bool) pageData {
	p := base
	p.Title = title
	p.Description = description
	if p.Origin != "" {
		if path == "/" {
			p.Canonical = p.Origin + "/"
		} else {
			p.Canonical = p.Origin + path
		}
	}
	if withJSONLD {
		p.JSONLD = webApplicationJSONLD(p.Canonical)
	}
	return p
}

func webApplicationJSONLD(pageURL string) template.JS {
	payload := map[string]string{
		"@context":    "https://schema.org",
		"@type":       "WebApplication",
		"name":        "fair(ish) dice",
		"description": homeDescription,
	}
	if pageURL != "" {
		payload["url"] = pageURL
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	return template.JS(raw)
}

func sitemapXML(origin string) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, path := range sitePaths {
		loc := origin + path
		if path == "/" {
			loc = origin + "/"
		}
		b.WriteString("  <url><loc>")
		_ = xml.EscapeText(&b, []byte(loc))
		b.WriteString("</loc></url>\n")
	}
	b.WriteString("</urlset>\n")
	return b.String()
}

func robotsTxt(origin string) string {
	body := "User-agent: *\nAllow: /\n"
	if origin != "" {
		body += "\nSitemap: " + origin + "/sitemap.xml\n"
	}
	return body
}

func handleSitemap(origin string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if origin == "" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		w.Write([]byte(sitemapXML(origin)))
	}
}

func handleRobots(origin string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Write([]byte(robotsTxt(origin)))
	}
}

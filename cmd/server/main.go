// Run from the repository root so dist/ and templates/ resolve correctly:
//
//	go run ./cmd/server
package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
)

type pageData struct {
	Stylesheet         string
	ExplainStylesheet  string
	FeedbackStylesheet string
	Script             string
	FeedbackScript     string
	PreloadFonts       []string
	Origin             string
	Title              string
	Description        string
	Canonical          string
	JSONLD             template.JS
}

type manifestChunk struct {
	File    string   `json:"file"`
	CSS     []string `json:"css"`
	Assets  []string `json:"assets"`
	IsEntry bool     `json:"isEntry"`
	Src     string   `json:"src"`
}

type historyRoll struct {
	Die    string `json:"die"`
	Value  int    `json:"value"`
	Detail string `json:"detail,omitempty"`
}

type dieSequence struct {
	Name     string
	Sequence string
}

type historyViewData struct {
	Empty       bool
	AllSequence string
	ByDie       []dieSequence
}

func main() {
	if err := loadDotEnv(".env"); err != nil {
		log.Printf("failed to load .env: %v", err)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8888"
	}
	// PUBLIC_ORIGIN is the public site URL with no path, e.g. https://example.com.
	// It is used for canonical tags, Open Graph URLs, robots.txt, and sitemap.xml.
	addr := ":" + port

	assets, err := loadViteAssets("dist/.vite/manifest.json")
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load Vite manifest: %v\nrun: npm run build\n", err)
		os.Exit(1)
	}
	assets.Origin = loadPublicOrigin()

	tmpl, err := template.ParseFiles(
		"templates/seo.html",
		"templates/index.html",
		"templates/history.html",
		"templates/explain.html",
		"templates/feedback.html",
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to parse templates: %v\n", err)
		os.Exit(1)
	}

	feedback := loadFeedbackConfig()

	mux := http.NewServeMux()
	mux.Handle("GET /vendor/", http.StripPrefix("/vendor/", http.FileServer(http.Dir("assets"))))
	mux.Handle("GET /assets/", http.StripPrefix("/assets/", immutableAssets(http.FileServer(http.Dir("dist/assets")))))
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		page := assets.forPage(homeTitle, homeDescription, "/", true)
		if err := tmpl.ExecuteTemplate(w, "index.html", page); err != nil {
			log.Printf("template error: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}
	})
	mux.HandleFunc("GET /explain", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		page := assets.forPage(explainTitle, explainDescription, "/explain", false)
		if err := tmpl.ExecuteTemplate(w, "explain.html", page); err != nil {
			log.Printf("template error: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}
	})
	mux.HandleFunc("GET /feedback", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		page := assets.forPage(feedbackTitle, feedbackDescription, "/feedback", false)
		if err := tmpl.ExecuteTemplate(w, "feedback.html", page); err != nil {
			log.Printf("template error: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}
	})
	mux.HandleFunc("GET /sitemap.xml", handleSitemap(assets.Origin))
	mux.HandleFunc("GET /robots.txt", handleRobots(assets.Origin))
	mux.HandleFunc("POST /feedback", feedback.handlePost)
	mux.HandleFunc("POST /history", func(w http.ResponseWriter, r *http.Request) {
		rolls, err := parseHistoryPayload(r)
		if err != nil {
			log.Printf("history parse error: %v", err)
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if err := tmpl.ExecuteTemplate(w, "history", buildHistoryView(rolls)); err != nil {
			log.Printf("history template error: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}
	})
	mux.HandleFunc("GET /{file}", servePublicFile)

	log.Printf("serving templates + dist assets at http://localhost%s/", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}

func parseHistoryPayload(r *http.Request) ([]historyRoll, error) {
	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "application/json") {
		defer r.Body.Close()
		var rolls []historyRoll
		if err := json.NewDecoder(r.Body).Decode(&rolls); err != nil {
			return nil, err
		}
		return rolls, nil
	}

	if err := r.ParseForm(); err != nil {
		return nil, err
	}

	raw := r.FormValue("history")
	if raw == "" {
		return []historyRoll{}, nil
	}

	var rolls []historyRoll
	if err := json.Unmarshal([]byte(raw), &rolls); err != nil {
		return nil, err
	}
	return rolls, nil
}

func formatHistoryValue(roll historyRoll) string {
	value := strconv.Itoa(roll.Value)
	detail := strings.TrimSpace(roll.Detail)
	if detail == "" {
		return value
	}
	return value + " (" + detail + ")"
}

func buildHistoryView(rolls []historyRoll) historyViewData {
	if len(rolls) == 0 {
		return historyViewData{Empty: true}
	}

	allParts := make([]string, 0, len(rolls))
	order := make([]string, 0)
	byDie := make(map[string][]string)

	for _, roll := range rolls {
		die := strings.TrimSpace(roll.Die)
		if die == "" {
			die = "?"
		}
		value := formatHistoryValue(roll)
		allParts = append(allParts, die+":"+value)

		if _, seen := byDie[die]; !seen {
			order = append(order, die)
			byDie[die] = nil
		}
		byDie[die] = append(byDie[die], value)
	}

	sequences := make([]dieSequence, 0, len(order))
	for _, die := range order {
		sequences = append(sequences, dieSequence{
			Name:     die,
			Sequence: strings.Join(byDie[die], ", "),
		})
	}

	return historyViewData{
		AllSequence: strings.Join(allParts, ", "),
		ByDie:       sequences,
	}
}

func loadViteAssets(manifestPath string) (pageData, error) {
	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		return pageData{}, err
	}

	var manifest map[string]manifestChunk
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return pageData{}, fmt.Errorf("parse %s: %w", manifestPath, err)
	}

	entry, ok := manifest["src/main.ts"]
	if !ok {
		for _, chunk := range manifest {
			if chunk.IsEntry && strings.HasSuffix(chunk.File, ".js") {
				entry = chunk
				ok = true
				break
			}
		}
	}
	if !ok || entry.File == "" {
		return pageData{}, fmt.Errorf("no JS entry found in %s", manifestPath)
	}

	data := pageData{Script: "/" + entry.File}
	if len(entry.CSS) > 0 {
		data.Stylesheet = "/" + entry.CSS[0]
	}
	if explainCSS, ok := stylesheetFromManifest(manifest, "src/explain.css"); ok {
		data.ExplainStylesheet = explainCSS
	}
	if chunk, ok := manifest["src/feedback.ts"]; ok && chunk.File != "" {
		data.FeedbackScript = "/" + chunk.File
	}
	if feedbackCSS, ok := stylesheetFromManifest(manifest, "src/feedback.ts"); ok {
		data.FeedbackStylesheet = feedbackCSS
	}
	data.PreloadFonts = preloadFonts(manifest, entry)
	return data, nil
}

func immutableAssets(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		next.ServeHTTP(w, r)
	})
}

func chunkAssets(manifest map[string]manifestChunk, chunk manifestChunk) []string {
	files := append([]string{}, chunk.Assets...)
	for _, css := range chunk.CSS {
		for _, other := range manifest {
			if other.File == css {
				files = append(files, other.Assets...)
				break
			}
		}
	}
	return files
}

func preloadFonts(manifest map[string]manifestChunk, entry manifestChunk) []string {
	wanted := []string{"inter-latin-400", "space-grotesk-latin-700"}
	files := chunkAssets(manifest, entry)
	if len(files) == 0 {
		for _, chunk := range manifest {
			files = append(files, chunk.Assets...)
		}
	}
	preloads := make([]string, 0, len(wanted))
	for _, name := range wanted {
		for _, file := range files {
			if !strings.Contains(file, name) || !strings.HasSuffix(file, ".woff2") {
				continue
			}
			preloads = append(preloads, "/"+file)
			break
		}
	}
	return preloads
}

func stylesheetFromManifest(manifest map[string]manifestChunk, src string) (string, bool) {
	chunk, ok := manifest[src]
	if !ok {
		return "", false
	}
	if strings.HasSuffix(chunk.File, ".css") {
		return "/" + chunk.File, true
	}
	if len(chunk.CSS) > 0 {
		return "/" + chunk.CSS[0], true
	}
	return "", false
}

func servePublicFile(w http.ResponseWriter, r *http.Request) {
	name := path.Base(r.PathValue("file"))
	if name == "." || name == "/" || name == "index.html" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, path.Join("dist", name))
}

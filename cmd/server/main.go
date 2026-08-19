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
	Stylesheet string
	Script     string
}

type manifestChunk struct {
	File    string   `json:"file"`
	CSS     []string `json:"css"`
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
	port := os.Getenv("PORT")
	if port == "" {
		port = "8888"
	}
	addr := ":" + port

	assets, err := loadViteAssets("dist/.vite/manifest.json")
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load Vite manifest: %v\nrun: npm run build\n", err)
		os.Exit(1)
	}

	tmpl, err := template.ParseFiles("templates/index.html", "templates/history.html")
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to parse templates: %v\n", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()
	mux.Handle("GET /vendor/", http.StripPrefix("/vendor/", http.FileServer(http.Dir("assets"))))
	mux.Handle("GET /assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir("dist/assets"))))
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if err := tmpl.ExecuteTemplate(w, "index.html", assets); err != nil {
			log.Printf("template error: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
		}
	})
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
	return data, nil
}

func servePublicFile(w http.ResponseWriter, r *http.Request) {
	name := path.Base(r.PathValue("file"))
	if name == "." || name == "/" || name == "index.html" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, path.Join("dist", name))
}

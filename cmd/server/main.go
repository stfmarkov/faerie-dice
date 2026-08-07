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

	tmpl, err := template.ParseFiles("templates/index.html")
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to parse templates: %v\n", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()
	mux.Handle("GET /assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir("dist/assets"))))
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if err := tmpl.Execute(w, assets); err != nil {
			log.Printf("template error: %v", err)
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

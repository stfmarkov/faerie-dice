package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDotEnvDoesNotOverrideExisting(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	if err := os.WriteFile(path, []byte("DOTENV_TEST_KEY=from-file\nDOTENV_TEST_OTHER=loaded\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("DOTENV_TEST_KEY", "already-set")
	os.Unsetenv("DOTENV_TEST_OTHER")

	if err := loadDotEnv(path); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("DOTENV_TEST_KEY"); got != "already-set" {
		t.Fatalf("overrode existing env: %q", got)
	}
	if got := os.Getenv("DOTENV_TEST_OTHER"); got != "loaded" {
		t.Fatalf("did not load missing env: %q", got)
	}
}

func TestLoadDotEnvMissingFile(t *testing.T) {
	if err := loadDotEnv(filepath.Join(t.TempDir(), ".env")); err != nil {
		t.Fatal(err)
	}
}

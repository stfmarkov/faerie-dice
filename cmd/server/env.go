package main

import (
	"errors"
	"os"

	"github.com/joho/godotenv"
)

func loadDotEnv(path string) error {
	err := godotenv.Load(path)
	if err != nil && errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

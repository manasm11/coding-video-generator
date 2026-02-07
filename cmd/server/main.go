package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"coding-video-generator/internal/config"
	"coding-video-generator/internal/handler"
	"coding-video-generator/internal/job"
	"coding-video-generator/internal/sse"
)

func main() {
	// Ensure output directories exist
	os.MkdirAll(config.OutputDir, 0755)
	os.MkdirAll(config.AudioDir, 0755)

	store := job.NewStore()
	sseManager := sse.NewManager()

	mux := http.NewServeMux()

	// Static files
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// Pages
	mux.HandleFunc("GET /", handler.HandleIndex(store))
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"ok"}`)
	})

	// API
	mux.HandleFunc("POST /api/generate", handler.HandleGenerate(store, sseManager))
	mux.HandleFunc("POST /api/preview", handler.HandlePreview(store))
	mux.HandleFunc("GET /api/jobs/{jobId}", handler.HandleGetJob(store))
	mux.HandleFunc("GET /api/jobs", handler.HandleListJobs(store))
	mux.HandleFunc("DELETE /api/jobs/{jobId}", handler.HandleDeleteJob(store, sseManager))
	mux.HandleFunc("GET /api/jobs/{jobId}/card", handler.HandleJobCard(store))
	mux.HandleFunc("GET /api/jobs/{jobId}/stream", handler.HandleSSE(store, sseManager))

	// File serving
	mux.HandleFunc("GET /api/videos/{jobId}", handler.HandleServeVideo(store))
	mux.HandleFunc("GET /api/videos/{jobId}/download", handler.HandleDownloadVideo(store))
	mux.HandleFunc("GET /api/audio/{jobId}/{step}", handler.HandleServeAudio(store))

	log.Printf("Server starting on http://localhost%s", config.ServerPort)
	if err := http.ListenAndServe(config.ServerPort, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

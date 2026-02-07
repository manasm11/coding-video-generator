package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"coding-video-generator/internal/job"
	"coding-video-generator/internal/models"
	"coding-video-generator/internal/service"
	"coding-video-generator/internal/sse"
	"coding-video-generator/templates/components"
)

func HandleGenerate(store *job.Store, sseManager *sse.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Invalid form data", http.StatusBadRequest)
			return
		}

		prompt := r.FormValue("prompt")
		if prompt == "" {
			http.Error(w, "Prompt is required", http.StatusBadRequest)
			return
		}

		language := r.FormValue("language")
		if language == "" {
			language = "javascript"
		}

		style := models.StyleLevel(r.FormValue("style"))
		if style == "" {
			style = models.StyleBeginner
		}

		voiceSpeed := 1.0
		if vs := r.FormValue("voiceSpeed"); vs != "" {
			if v, err := strconv.ParseFloat(vs, 64); err == nil {
				voiceSpeed = v
			}
		}

		jobID := generateID()
		j := models.NewJob(jobID, prompt, language, style, voiceSpeed)
		store.Set(j)

		// Start async pipeline
		go service.ProcessJob(jobID, store, sseManager)

		// Return the new job card HTML, prepended to job list
		w.Header().Set("Content-Type", "text/html")
		component := components.JobCard(j)
		component.Render(r.Context(), w)
	}
}

func HandlePreview(store *job.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Invalid form data", http.StatusBadRequest)
			return
		}

		prompt := r.FormValue("prompt")
		if prompt == "" {
			http.Error(w, "Prompt is required", http.StatusBadRequest)
			return
		}

		language := r.FormValue("language")
		if language == "" {
			language = "javascript"
		}

		style := models.StyleLevel(r.FormValue("style"))
		if style == "" {
			style = models.StyleBeginner
		}

		content, err := service.GenerateTutorialContent(
			context.Background(), prompt, language, style, nil, nil, "",
		)
		if err != nil {
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprintf(w, `<article class="preview-error"><p>Failed to generate preview: %s</p></article>`, err.Error())
			return
		}

		w.Header().Set("Content-Type", "text/html")
		component := components.Preview(content)
		component.Render(r.Context(), w)
	}
}

func HandleGetJob(store *job.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID := r.PathValue("jobId")
		j, ok := store.Get(jobID)
		if !ok {
			http.Error(w, "Job not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(j)
	}
}

func HandleListJobs(store *job.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobs := store.All()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(jobs)
	}
}

func HandleDeleteJob(store *job.Store, sseManager *sse.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID := r.PathValue("jobId")
		_, ok := store.Get(jobID)
		if !ok {
			http.Error(w, "Job not found", http.StatusNotFound)
			return
		}

		service.DeleteVideo(jobID)
		service.CleanupAudio(jobID)
		sseManager.Cleanup(jobID)
		store.Delete(jobID)

		// Return empty response — htmx will remove the card from the DOM
		w.WriteHeader(http.StatusOK)
	}
}

// HandleJobCard returns a single job card HTML partial for htmx polling.
func HandleJobCard(store *job.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID := r.PathValue("jobId")
		j, ok := store.Get(jobID)
		if !ok {
			http.Error(w, "Job not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "text/html")
		component := components.JobCard(j)
		component.Render(r.Context(), w)
	}
}

func generateID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

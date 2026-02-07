package handler

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"

	"coding-video-generator/internal/config"
	"coding-video-generator/internal/job"
	"coding-video-generator/internal/models"
	"coding-video-generator/internal/service"
)

func HandleServeVideo(store *job.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID := r.PathValue("jobId")
		j, ok := store.Get(jobID)
		if !ok || j.Status != models.StatusCompleted || j.VideoPath == "" {
			http.Error(w, "Video not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "video/mp4")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.mp4"`, jobID))
		http.ServeFile(w, r, j.VideoPath)
	}
}

func HandleServeAudio(store *job.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID := r.PathValue("jobId")
		stepStr := r.PathValue("step")
		step, err := strconv.Atoi(stepStr)
		if err != nil {
			http.Error(w, "Invalid step", http.StatusBadRequest)
			return
		}

		audioPath := filepath.Join(config.AudioDir, fmt.Sprintf("%s_step_%d.mp3", jobID, step))
		absPath, _ := filepath.Abs(audioPath)

		w.Header().Set("Content-Type", "audio/mpeg")
		http.ServeFile(w, r, absPath)
	}
}

func HandleDownloadVideo(store *job.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID := r.PathValue("jobId")
		videoPath := service.GetVideoPath(jobID)
		if videoPath == "" {
			http.Error(w, "Video not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "video/mp4")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.mp4"`, jobID))
		http.ServeFile(w, r, videoPath)
	}
}

package handler

import (
	"fmt"
	"net/http"
	"time"

	"coding-video-generator/internal/config"
	"coding-video-generator/internal/job"
	"coding-video-generator/internal/sse"
)

func HandleSSE(store *job.Store, sseManager *sse.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID := r.PathValue("jobId")
		if _, ok := store.Get(jobID); !ok {
			http.Error(w, "Job not found", http.StatusNotFound)
			return
		}

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming not supported", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")

		sub, history := sseManager.Subscribe(jobID)
		defer sseManager.Unsubscribe(jobID, sub)

		// Send connection confirmation
		fmt.Fprintf(w, "event: terminal\ndata: <span class=\"t-info\">Connected to job %s</span><br/>\n\n", jobID)
		flusher.Flush()

		// Send buffered history
		for _, line := range history {
			fmt.Fprint(w, sse.FormatSSEHTML(line))
		}
		flusher.Flush()

		// Stream new events
		keepalive := time.NewTicker(config.SSEKeepaliveInterval)
		defer keepalive.Stop()

		for {
			select {
			case <-r.Context().Done():
				return
			case line, ok := <-sub.Channel():
				if !ok {
					return
				}
				fmt.Fprint(w, sse.FormatSSEHTML(line))
				flusher.Flush()

				// If the job is complete and the channel is drained, send close
				if sseManager.IsComplete(jobID) {
					fmt.Fprint(w, "event: status\ndata: done\n\n")
					flusher.Flush()
					return
				}
			case <-keepalive.C:
				fmt.Fprint(w, ": keepalive\n\n")
				flusher.Flush()

				if sseManager.IsComplete(jobID) {
					fmt.Fprint(w, "event: status\ndata: done\n\n")
					flusher.Flush()
					return
				}
			}
		}
	}
}

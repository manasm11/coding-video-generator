package handler

import (
	"net/http"

	"coding-video-generator/internal/job"
	"coding-video-generator/templates/pages"
)

// Deps holds shared dependencies for handlers.
type Deps struct {
	Store      *job.Store
	SSEManager interface{ // Avoid circular import; set from main
		Broadcast(string, interface{}, string)
	}
}

func HandleIndex(store *job.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobs := store.All()
		component := pages.Index(jobs)
		component.Render(r.Context(), w)
	}
}

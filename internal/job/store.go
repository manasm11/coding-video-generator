package job

import (
	"sync"

	"coding-video-generator/internal/models"
)

// Store is a thread-safe in-memory job store.
type Store struct {
	mu   sync.RWMutex
	jobs map[string]*models.GenerationJob
}

func NewStore() *Store {
	return &Store{
		jobs: make(map[string]*models.GenerationJob),
	}
}

func (s *Store) Set(job *models.GenerationJob) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jobs[job.ID] = job
}

func (s *Store) Get(id string) (*models.GenerationJob, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	job, ok := s.jobs[id]
	return job, ok
}

func (s *Store) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.jobs, id)
}

// All returns all jobs ordered by creation time (newest first).
func (s *Store) All() []*models.GenerationJob {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*models.GenerationJob, 0, len(s.jobs))
	for _, job := range s.jobs {
		result = append(result, job)
	}

	// Sort newest first
	for i := 0; i < len(result); i++ {
		for j := i + 1; j < len(result); j++ {
			if result[i].CreatedAt < result[j].CreatedAt {
				result[i], result[j] = result[j], result[i]
			}
		}
	}

	return result
}

package progress

import (
	"fmt"
	"log"
	"time"

	"coding-video-generator/internal/config"
	"coding-video-generator/internal/models"
)

// Tracker manages progress updates for a generation job.
type Tracker struct {
	Job *models.GenerationJob
}

func NewTracker(job *models.GenerationJob) *Tracker {
	return &Tracker{Job: job}
}

func (t *Tracker) StartPhase(status models.JobStatus, totalSteps *int) {
	t.Job.Status = status

	// Preserve existing logs
	var existingLogs []models.LogEntry
	if t.Job.Progress != nil {
		existingLogs = t.Job.Progress.Logs
	}

	var currentStep *int
	if totalSteps != nil {
		one := 1
		currentStep = &one
	}

	t.Job.Progress = &models.ProgressDetails{
		CurrentAction:  defaultAction(status),
		SubProgress:    0,
		CurrentStep:    currentStep,
		TotalSteps:     totalSteps,
		PhaseStartedAt: time.Now().UTC().Format(time.RFC3339),
		Logs:           existingLogs,
	}
	t.Log(fmt.Sprintf("Starting phase: %s", status))
}

func (t *Tracker) UpdateProgress(percent float64, action string, step *int) {
	if t.Job.Progress == nil {
		t.Job.Progress = &models.ProgressDetails{
			CurrentAction:  action,
			SubProgress:    percent,
			PhaseStartedAt: time.Now().UTC().Format(time.RFC3339),
			Logs:           []models.LogEntry{},
		}
	}

	if percent < 0 {
		percent = 0
	}
	if percent > 100 {
		percent = 100
	}

	t.Job.Progress.SubProgress = percent
	t.Job.Progress.CurrentAction = action

	if step != nil {
		t.Job.Progress.CurrentStep = step
	}

	t.Log(fmt.Sprintf("[%.0f%%] %s", percent, action))
}

func (t *Tracker) Log(message string) {
	if t.Job.Progress == nil {
		t.Job.Progress = &models.ProgressDetails{
			PhaseStartedAt: time.Now().UTC().Format(time.RFC3339),
			Logs:           []models.LogEntry{},
		}
	}

	entry := models.LogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Message:   message,
	}
	t.Job.Progress.Logs = append(t.Job.Progress.Logs, entry)

	if len(t.Job.Progress.Logs) > config.MaxLogs {
		t.Job.Progress.Logs = t.Job.Progress.Logs[len(t.Job.Progress.Logs)-config.MaxLogs:]
	}

	log.Printf("[%s] %s", t.Job.ID, message)
}

func (t *Tracker) CompletePhase() {
	if t.Job.Progress != nil {
		t.Job.Progress.SubProgress = 100
		t.Log(fmt.Sprintf("Phase completed: %s", t.Job.Status))
	}
}

func (t *Tracker) SetError(message string) {
	t.Job.Status = models.StatusError
	t.Job.Error = message
	t.Job.CompletedAt = time.Now().UTC().Format(time.RFC3339)
	t.Log(fmt.Sprintf("Error: %s", message))
}

func defaultAction(status models.JobStatus) string {
	switch status {
	case models.StatusPending:
		return "Waiting to start..."
	case models.StatusGeneratingContent:
		return "AI is generating tutorial content..."
	case models.StatusGeneratingAudio:
		return "Converting text to speech..."
	case models.StatusRendering:
		return "Rendering video..."
	case models.StatusCompleted:
		return "Done!"
	case models.StatusError:
		return "An error occurred"
	default:
		return "Processing..."
	}
}

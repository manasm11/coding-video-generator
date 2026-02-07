package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"coding-video-generator/internal/job"
	"coding-video-generator/internal/models"
	"coding-video-generator/internal/progress"
	"coding-video-generator/internal/sse"
)

// ProcessJob runs the 3-phase generation pipeline.
func ProcessJob(jobID string, store *job.Store, sseManager *sse.Manager) {
	j, ok := store.Get(jobID)
	if !ok {
		return
	}

	j.StartedAt = time.Now().UTC().Format(time.RFC3339)
	tracker := progress.NewTracker(j)
	ctx := context.Background()

	defer func() {
		if r := recover(); r != nil {
			tracker.SetError(fmt.Sprintf("panic: %v", r))
			sseManager.Broadcast(jobID, sse.EventStatus, "error")
			sseManager.CompleteJob(jobID)
		}
	}()

	// Phase 1: Generate content
	totalSteps := (*int)(nil)
	tracker.StartPhase(models.StatusGeneratingContent, totalSteps)
	sseManager.Broadcast(jobID, sse.EventStatus, "generating_content")
	log.Printf("[%s] Generating content...", jobID)

	content, err := GenerateTutorialContent(
		ctx, j.Prompt, j.Language, j.Style, tracker, sseManager, jobID,
	)
	if err != nil {
		tracker.SetError(fmt.Sprintf("Content generation failed: %v", err))
		sseManager.Broadcast(jobID, sse.EventStatus, "error")
		sseManager.CompleteJob(jobID)
		return
	}
	j.Content = content
	tracker.CompletePhase()

	// Phase 2: Generate audio
	numSteps := len(content.Steps)
	tracker.StartPhase(models.StatusGeneratingAudio, &numSteps)
	sseManager.Broadcast(jobID, sse.EventStatus, "generating_audio")
	log.Printf("[%s] Generating audio...", jobID)

	explanations := make([]string, len(content.Steps))
	for i, step := range content.Steps {
		explanations[i] = step.Explanation
	}

	audioFiles, err := GenerateAllAudio(ctx, explanations, jobID, j.VoiceSpeed, tracker)
	if err != nil {
		tracker.SetError(fmt.Sprintf("Audio generation failed: %v", err))
		sseManager.Broadcast(jobID, sse.EventStatus, "error")
		sseManager.CompleteJob(jobID)
		return
	}
	j.AudioFiles = audioFiles
	tracker.CompletePhase()

	// Phase 3: Render video
	tracker.StartPhase(models.StatusRendering, nil)
	sseManager.Broadcast(jobID, sse.EventStatus, "rendering")
	log.Printf("[%s] Rendering video...", jobID)

	videoPath, err := RenderVideo(ctx, jobID, content, audioFiles, tracker)
	if err != nil {
		tracker.SetError(fmt.Sprintf("Video rendering failed: %v", err))
		sseManager.Broadcast(jobID, sse.EventStatus, "error")
		sseManager.CompleteJob(jobID)
		return
	}

	j.VideoPath = videoPath
	j.Status = models.StatusCompleted
	j.CompletedAt = time.Now().UTC().Format(time.RFC3339)
	tracker.CompletePhase()
	log.Printf("[%s] Completed!", jobID)

	// Cleanup audio files after successful render
	CleanupAudio(jobID)

	// Signal completion to SSE clients
	sseManager.CompleteJob(jobID)
}

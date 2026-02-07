package models

import (
	"encoding/json"
	"time"
)

type JobStatus string

const (
	StatusPending           JobStatus = "pending"
	StatusGeneratingContent JobStatus = "generating_content"
	StatusGeneratingAudio   JobStatus = "generating_audio"
	StatusRendering         JobStatus = "rendering"
	StatusCompleted         JobStatus = "completed"
	StatusError             JobStatus = "error"
)

func (s JobStatus) Label() string {
	switch s {
	case StatusPending:
		return "Pending"
	case StatusGeneratingContent:
		return "Generating Content"
	case StatusGeneratingAudio:
		return "Generating Audio"
	case StatusRendering:
		return "Rendering Video"
	case StatusCompleted:
		return "Completed"
	case StatusError:
		return "Error"
	default:
		return "Unknown"
	}
}

func (s JobStatus) IsActive() bool {
	return s == StatusPending || s == StatusGeneratingContent ||
		s == StatusGeneratingAudio || s == StatusRendering
}

type StyleLevel string

const (
	StyleBeginner     StyleLevel = "beginner"
	StyleIntermediate StyleLevel = "intermediate"
	StyleAdvanced     StyleLevel = "advanced"
)

type TutorialStep struct {
	Code        string `json:"code"`
	Explanation string `json:"explanation"`
	Language    string `json:"language"`
}

type TutorialContent struct {
	Title string         `json:"title"`
	Steps []TutorialStep `json:"steps"`
}

type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Message   string `json:"message"`
}

type ProgressDetails struct {
	CurrentAction string     `json:"currentAction"`
	SubProgress   float64    `json:"subProgress"`
	CurrentStep   *int       `json:"currentStep,omitempty"`
	TotalSteps    *int       `json:"totalSteps,omitempty"`
	PhaseStartedAt string   `json:"phaseStartedAt"`
	Logs          []LogEntry `json:"logs"`
}

type GenerationJob struct {
	ID          string           `json:"id"`
	Status      JobStatus        `json:"status"`
	Prompt      string           `json:"prompt"`
	Language    string           `json:"language"`
	Style       StyleLevel       `json:"style"`
	VoiceSpeed  float64          `json:"voiceSpeed"`
	Content     *TutorialContent `json:"content,omitempty"`
	AudioFiles  []string         `json:"audioFiles,omitempty"`
	VideoPath   string           `json:"videoPath,omitempty"`
	Error       string           `json:"error,omitempty"`
	CreatedAt   string           `json:"createdAt"`
	StartedAt   string           `json:"startedAt,omitempty"`
	CompletedAt string           `json:"completedAt,omitempty"`
	Progress    *ProgressDetails `json:"progress,omitempty"`
}

func (j *GenerationJob) ToJSON() ([]byte, error) {
	return json.Marshal(j)
}

type GenerateRequest struct {
	Prompt     string     `json:"prompt"`
	Language   string     `json:"language"`
	Style      StyleLevel `json:"style"`
	VoiceSpeed float64    `json:"voiceSpeed"`
}

func NewJob(id, prompt, language string, style StyleLevel, voiceSpeed float64) *GenerationJob {
	return &GenerationJob{
		ID:         id,
		Status:     StatusPending,
		Prompt:     prompt,
		Language:   language,
		Style:      style,
		VoiceSpeed: voiceSpeed,
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
	}
}

// SupportedLanguages lists languages for the form dropdown.
var SupportedLanguages = []string{
	"JavaScript", "TypeScript", "Python", "Java", "C++",
	"C#", "Go", "Rust", "Ruby", "PHP",
}

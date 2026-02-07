package sse

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"coding-video-generator/internal/config"
)

type EventType string

const (
	EventStdout    EventType = "stdout"
	EventStderr    EventType = "stderr"
	EventStatus    EventType = "status"
	EventConnected EventType = "connected"
	EventHistory   EventType = "history"
)

type StreamLine struct {
	ID        string    `json:"id"`
	Type      EventType `json:"type"`
	Data      string    `json:"data"`
	Timestamp string    `json:"timestamp"`
}

type subscriber struct {
	ch     chan StreamLine
	closed bool
}

type jobBuffer struct {
	mu           sync.RWMutex
	lines        []StreamLine
	eventCounter int
	isComplete   bool
	subscribers  map[*subscriber]struct{}
}

// Manager handles SSE fan-out for job streaming.
type Manager struct {
	mu   sync.RWMutex
	jobs map[string]*jobBuffer
}

func NewManager() *Manager {
	return &Manager{
		jobs: make(map[string]*jobBuffer),
	}
}

func (m *Manager) getOrCreateBuffer(jobID string) *jobBuffer {
	m.mu.Lock()
	defer m.mu.Unlock()
	if buf, ok := m.jobs[jobID]; ok {
		return buf
	}
	buf := &jobBuffer{
		subscribers: make(map[*subscriber]struct{}),
	}
	m.jobs[jobID] = buf
	return buf
}

// Broadcast sends an event to all subscribers of a job.
func (m *Manager) Broadcast(jobID string, eventType EventType, data string) {
	buf := m.getOrCreateBuffer(jobID)
	buf.mu.Lock()
	defer buf.mu.Unlock()

	buf.eventCounter++
	line := StreamLine{
		ID:        fmt.Sprintf("%d", buf.eventCounter),
		Type:      eventType,
		Data:      data,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	buf.lines = append(buf.lines, line)
	if len(buf.lines) > config.MaxBufferLines {
		buf.lines = buf.lines[len(buf.lines)-config.MaxBufferLines:]
	}

	for sub := range buf.subscribers {
		if !sub.closed {
			select {
			case sub.ch <- line:
			default:
				// Queue full, skip
			}
		}
	}
}

// Subscribe returns a channel that receives SSE events for a job.
// The caller must call Unsubscribe when done.
func (m *Manager) Subscribe(jobID string) (*subscriber, []StreamLine) {
	buf := m.getOrCreateBuffer(jobID)
	buf.mu.Lock()
	defer buf.mu.Unlock()

	sub := &subscriber{
		ch: make(chan StreamLine, config.SubscriberQueueSize),
	}
	buf.subscribers[sub] = struct{}{}

	// Return a copy of existing history
	history := make([]StreamLine, len(buf.lines))
	copy(history, buf.lines)

	return sub, history
}

// Unsubscribe removes a subscriber.
func (m *Manager) Unsubscribe(jobID string, sub *subscriber) {
	m.mu.RLock()
	buf, ok := m.jobs[jobID]
	m.mu.RUnlock()
	if !ok {
		return
	}

	buf.mu.Lock()
	defer buf.mu.Unlock()
	sub.closed = true
	close(sub.ch)
	delete(buf.subscribers, sub)
}

// Channel returns the subscriber's event channel.
func (s *subscriber) Channel() <-chan StreamLine {
	return s.ch
}

// CompleteJob marks a job as complete and schedules cleanup.
func (m *Manager) CompleteJob(jobID string) {
	m.mu.RLock()
	buf, ok := m.jobs[jobID]
	m.mu.RUnlock()
	if !ok {
		return
	}

	buf.mu.Lock()
	buf.isComplete = true
	buf.mu.Unlock()

	// Broadcast completion
	m.Broadcast(jobID, EventStatus, "completed")

	// Schedule cleanup after grace period
	go func() {
		time.Sleep(config.CleanupGracePeriod)
		m.Cleanup(jobID)
	}()
}

// IsComplete checks if a job's SSE stream is done.
func (m *Manager) IsComplete(jobID string) bool {
	m.mu.RLock()
	buf, ok := m.jobs[jobID]
	m.mu.RUnlock()
	if !ok {
		return true
	}
	buf.mu.RLock()
	defer buf.mu.RUnlock()
	return buf.isComplete
}

// Cleanup removes a job's SSE resources.
func (m *Manager) Cleanup(jobID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if buf, ok := m.jobs[jobID]; ok {
		buf.mu.Lock()
		for sub := range buf.subscribers {
			if !sub.closed {
				sub.closed = true
				close(sub.ch)
			}
		}
		buf.mu.Unlock()
		delete(m.jobs, jobID)
	}
}

// FormatSSE formats a StreamLine as an SSE message string.
func FormatSSE(line StreamLine) string {
	data, _ := json.Marshal(line)
	return fmt.Sprintf("id: %s\nevent: %s\ndata: %s\n\n", line.ID, line.Type, string(data))
}

// FormatSSEHTML formats a StreamLine as an SSE message with HTML data for htmx.
func FormatSSEHTML(line StreamLine) string {
	var class string
	switch line.Type {
	case EventStdout:
		class = "t-stdout"
	case EventStderr:
		class = "t-stderr"
	case EventStatus:
		class = "t-status"
	default:
		class = "t-info"
	}
	htmlData := fmt.Sprintf(`<span class="%s">%s</span><br/>`, class, line.Data)
	return fmt.Sprintf("event: terminal\ndata: %s\n\n", htmlData)
}

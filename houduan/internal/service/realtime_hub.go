package service

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"serverai-backend/internal/model"
)

type RealtimeEnvelope struct {
	Type         string              `json:"type"`
	Connected    bool                `json:"connected,omitempty"`
	UnreadCount  int64               `json:"unreadCount,omitempty"`
	OnlineUsers  int                 `json:"onlineUsers,omitempty"`
	Notification *model.Notification `json:"notification,omitempty"`
	ServerTime   time.Time           `json:"serverTime,omitempty"`
}

type OnlineUserSnapshot struct {
	UserID      string
	Connections int
}

type realtimeClient struct {
	hub       *realtimeHub
	conn      *websocket.Conn
	send      chan []byte
	userID    string
	role      string
	closeOnce sync.Once
}

type realtimeHub struct {
	mu            sync.RWMutex
	clients       map[*realtimeClient]struct{}
	clientsByUser map[string]map[*realtimeClient]struct{}
	adminClients  map[*realtimeClient]struct{}
}

var realtimeHubInstance = newRealtimeHub()

func Realtime() *realtimeHub {
	return realtimeHubInstance
}

func newRealtimeHub() *realtimeHub {
	return &realtimeHub{
		clients:       make(map[*realtimeClient]struct{}),
		clientsByUser: make(map[string]map[*realtimeClient]struct{}),
		adminClients:  make(map[*realtimeClient]struct{}),
	}
}

func (h *realtimeHub) Register(conn *websocket.Conn, userID, role string) {
	client := &realtimeClient{
		hub:    h,
		conn:   conn,
		send:   make(chan []byte, 32),
		userID: userID,
		role:   role,
	}

	h.mu.Lock()
	h.clients[client] = struct{}{}
	if _, ok := h.clientsByUser[userID]; !ok {
		h.clientsByUser[userID] = make(map[*realtimeClient]struct{})
	}
	h.clientsByUser[userID][client] = struct{}{}
	if role == "ADMIN" {
		h.adminClients[client] = struct{}{}
	}
	onlineUsers := h.onlineUserCountLocked()
	h.mu.Unlock()

	go client.writePump()
	go client.readPump()

	client.enqueue(RealtimeEnvelope{
		Type:        "connected",
		Connected:   true,
		OnlineUsers: onlineUsers,
		ServerTime:  time.Now().UTC(),
	})
	h.broadcastOnlineUsers()
}

func (h *realtimeHub) unregister(client *realtimeClient) {
	h.mu.Lock()
	if _, ok := h.clients[client]; !ok {
		h.mu.Unlock()
		return
	}

	delete(h.clients, client)
	if perUser, ok := h.clientsByUser[client.userID]; ok {
		delete(perUser, client)
		if len(perUser) == 0 {
			delete(h.clientsByUser, client.userID)
		}
	}
	delete(h.adminClients, client)
	h.mu.Unlock()

	client.closeSend()
	_ = client.conn.Close()
	h.broadcastOnlineUsers()
}

func (h *realtimeHub) SendNotification(userID string, notification *model.Notification, unreadCount int64) {
	payload := RealtimeEnvelope{
		Type:         "notification",
		Notification: notification,
		UnreadCount:  unreadCount,
	}

	h.mu.RLock()
	targets := make([]*realtimeClient, 0)
	for client := range h.clientsByUser[userID] {
		targets = append(targets, client)
	}
	h.mu.RUnlock()

	for _, client := range targets {
		client.enqueue(payload)
	}
}

func (h *realtimeHub) broadcastOnlineUsers() {
	h.mu.RLock()
	onlineUsers := h.onlineUserCountLocked()
	targets := make([]*realtimeClient, 0, len(h.adminClients))
	for client := range h.adminClients {
		targets = append(targets, client)
	}
	h.mu.RUnlock()

	payload := RealtimeEnvelope{
		Type:        "online_users",
		OnlineUsers: onlineUsers,
	}
	for _, client := range targets {
		client.enqueue(payload)
	}
}

func (h *realtimeHub) onlineUserCountLocked() int {
	return len(h.clientsByUser)
}

func (h *realtimeHub) OnlineUsersSnapshot() []OnlineUserSnapshot {
	h.mu.RLock()
	defer h.mu.RUnlock()

	result := make([]OnlineUserSnapshot, 0, len(h.clientsByUser))
	for userID, clients := range h.clientsByUser {
		result = append(result, OnlineUserSnapshot{
			UserID:      userID,
			Connections: len(clients),
		})
	}
	return result
}

// UserConnectionCount returns the number of active WS connections for a user.
func (h *realtimeHub) UserConnectionCount(userID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clientsByUser[userID])
}

func (c *realtimeClient) enqueue(payload RealtimeEnvelope) {
	raw, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[realtime] marshal payload failed: %v", err)
		return
	}

	defer func() {
		if recover() != nil {
			go c.hub.unregister(c)
		}
	}()

	select {
	case c.send <- raw:
	default:
		go c.hub.unregister(c)
	}
}

func (c *realtimeClient) closeSend() {
	c.closeOnce.Do(func() {
		close(c.send)
	})
}

func (c *realtimeClient) readPump() {
	defer c.hub.unregister(c)

	c.conn.SetReadLimit(1024)
	_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})

	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (c *realtimeClient) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	defer c.hub.unregister(c)

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

package service

import (
	"strings"
	"time"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

func CreateNotification(userID, notifType, title, content string, relatedID, relatedType *string) (*model.Notification, error) {
	n := &model.Notification{
		ID:          GenerateID(),
		UserID:      userID,
		Type:        notifType,
		Title:       title,
		Content:     content,
		IsRead:      false,
		RelatedID:   relatedID,
		RelatedType: relatedType,
		CreatedAt:   time.Now(),
	}
	if err := database.DB.Create(n).Error; err != nil {
		return nil, err
	}
	dispatchNotification(n)
	return n, nil
}

func CreateNotificationBatch(records []model.Notification) error {
	if len(records) == 0 {
		return nil
	}

	now := time.Now()
	for i := range records {
		if records[i].ID == "" {
			records[i].ID = GenerateID()
		}
		if records[i].CreatedAt.IsZero() {
			records[i].CreatedAt = now
		}
	}

	if err := database.DB.CreateInBatches(&records, 100).Error; err != nil {
		return err
	}

	for i := range records {
		dispatchNotification(&records[i])
	}
	return nil
}

func CreateNotificationForUsers(userIDs []string, notifType, title, content string, relatedID, relatedType *string) (int, error) {
	records := make([]model.Notification, 0, len(userIDs))
	for _, userID := range userIDs {
		if strings.TrimSpace(userID) == "" {
			continue
		}
		records = append(records, model.Notification{
			ID:          GenerateID(),
			UserID:      userID,
			Type:        notifType,
			Title:       title,
			Content:     content,
			IsRead:      false,
			RelatedID:   relatedID,
			RelatedType: relatedType,
			CreatedAt:   time.Now(),
		})
	}
	if err := CreateNotificationBatch(records); err != nil {
		return 0, err
	}
	return len(records), nil
}

func NotificationTargetURL(notification model.Notification) string {
	if notification.RelatedID != nil && notification.RelatedType != nil {
		switch strings.ToLower(*notification.RelatedType) {
		case "ticket":
			return "/dashboard/tickets/" + *notification.RelatedID
		case "server":
			return "/dashboard/servers/" + *notification.RelatedID
		}
	}

	switch notification.Type {
	case "TICKET_REPLY", "TICKET_RATING", "TICKET_ROUTED", "TICKET_ESCALATION_2H", "TICKET_ESCALATION_8H":
		return "/dashboard/tickets"
	case "SERVER_EXPIRY", "SERVER_TRANSFER", "SERVER_STATUS":
		return "/dashboard/servers"
	case "BALANCE_CHANGE", "INVITE_REWARD", "INVITEE_BONUS":
		return "/dashboard/finance"
	case "COMMISSION":
		return "/agent/commissions"
	case "SECURITY_ALERT", "PASSWORD_RESET":
		return "/dashboard/profile"
	default:
		return "/dashboard/notifications"
	}
}

func dispatchNotification(notification *model.Notification) {
	var unreadCount int64
	database.DB.Model(&model.Notification{}).
		Where("user_id = ? AND is_read = false", notification.UserID).
		Count(&unreadCount)

	Realtime().SendNotification(notification.UserID, notification, unreadCount)

	copyForPush := *notification
	go sendBrowserPushNotification(copyForPush)
}

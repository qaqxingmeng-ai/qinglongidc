package service

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/SherClockHolmes/webpush-go"
	"gorm.io/gorm"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
)

type webPushConfig struct {
	publicKey  string
	privateKey string
	subject    string
}

var currentWebPushConfig webPushConfig

func InitWebPush(publicKey, privateKey, subject string) {
	currentWebPushConfig = webPushConfig{
		publicKey:  strings.TrimSpace(publicKey),
		privateKey: strings.TrimSpace(privateKey),
		subject:    strings.TrimSpace(subject),
	}
}

func WebPushConfigured() bool {
	return currentWebPushConfig.publicKey != "" &&
		currentWebPushConfig.privateKey != "" &&
		currentWebPushConfig.subject != ""
}

func PublicWebPushKey() string {
	return currentWebPushConfig.publicKey
}

func GetOrCreateNotificationPreference(userID string) (*model.NotificationPreference, error) {
	var pref model.NotificationPreference
	err := database.DB.First(&pref, "user_id = ?", userID).Error
	if err == nil {
		return &pref, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	pref = model.NotificationPreference{
		UserID:             userID,
		BrowserPushEnabled: false,
		TicketReplyPush:    true,
		ServerExpiryPush:   true,
		BalanceChangePush:  true,
		SecurityAlertPush:  true,
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}
	if err := database.DB.Create(&pref).Error; err != nil {
		return nil, err
	}
	return &pref, nil
}

func UpsertNotificationSubscription(userID, endpoint, p256dh, auth string, userAgent *string) (*model.NotificationSubscription, error) {
	var subscription model.NotificationSubscription
	now := time.Now()

	err := database.DB.First(&subscription, "endpoint = ?", endpoint).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		subscription = model.NotificationSubscription{
			ID:         GenerateID(),
			UserID:     userID,
			Endpoint:   endpoint,
			P256DH:     p256dh,
			Auth:       auth,
			UserAgent:  userAgent,
			LastSeenAt: &now,
			CreatedAt:  now,
			UpdatedAt:  now,
		}
		if err := database.DB.Create(&subscription).Error; err != nil {
			return nil, err
		}
		return &subscription, nil
	}
	if err != nil {
		return nil, err
	}

	updates := map[string]interface{}{
		"user_id":      userID,
		"p256dh":       p256dh,
		"auth":         auth,
		"user_agent":   userAgent,
		"last_seen_at": now,
		"updated_at":   now,
	}
	if err := database.DB.Model(&subscription).Updates(updates).Error; err != nil {
		return nil, err
	}
	subscription.UserID = userID
	subscription.P256DH = p256dh
	subscription.Auth = auth
	subscription.UserAgent = userAgent
	subscription.LastSeenAt = &now
	subscription.UpdatedAt = now
	return &subscription, nil
}

func DeleteNotificationSubscription(userID, endpoint string) error {
	query := database.DB.Where("user_id = ?", userID)
	if strings.TrimSpace(endpoint) != "" {
		query = query.Where("endpoint = ?", endpoint)
	}
	return query.Delete(&model.NotificationSubscription{}).Error
}

func sendBrowserPushNotification(notification model.Notification) {
	if !WebPushConfigured() {
		return
	}

	pref, err := GetOrCreateNotificationPreference(notification.UserID)
	if err != nil {
		log.Printf("[webpush] load preference failed: %v", err)
		return
	}
	if !pref.BrowserPushEnabled || !notificationAllowed(*pref, notification.Type) {
		return
	}

	var subscriptions []model.NotificationSubscription
	if err := database.DB.Where("user_id = ?", notification.UserID).Find(&subscriptions).Error; err != nil || len(subscriptions) == 0 {
		return
	}

	payload, err := json.Marshal(map[string]interface{}{
		"title":          notification.Title,
		"body":           notification.Content,
		"url":            NotificationTargetURL(notification),
		"type":           notification.Type,
		"notificationId": notification.ID,
	})
	if err != nil {
		log.Printf("[webpush] marshal payload failed: %v", err)
		return
	}

	options := &webpush.Options{
		Subscriber:      currentWebPushConfig.subject,
		VAPIDPublicKey:  currentWebPushConfig.publicKey,
		VAPIDPrivateKey: currentWebPushConfig.privateKey,
		TTL:             60,
	}

	for _, subscription := range subscriptions {
		sub := &webpush.Subscription{
			Endpoint: subscription.Endpoint,
			Keys: webpush.Keys{
				Auth:   subscription.Auth,
				P256dh: subscription.P256DH,
			},
		}

		resp, err := webpush.SendNotification(payload, sub, options)
		if err != nil {
			log.Printf("[webpush] send notification failed: %v", err)
			continue
		}
		if resp.Body != nil {
			_ = resp.Body.Close()
		}

		switch resp.StatusCode {
		case http.StatusCreated, http.StatusAccepted:
			now := time.Now()
			_ = database.DB.Model(&subscription).Updates(map[string]interface{}{
				"last_seen_at": now,
				"updated_at":   now,
			}).Error
		case http.StatusGone, http.StatusNotFound:
			_ = DeleteNotificationSubscription(notification.UserID, subscription.Endpoint)
		default:
			log.Printf("[webpush] unexpected status=%d endpoint=%s", resp.StatusCode, subscription.Endpoint)
		}
	}
}

func notificationAllowed(pref model.NotificationPreference, notifType string) bool {
	switch notifType {
	case "TICKET_REPLY", "TICKET_RATING", "TICKET_ROUTED", "TICKET_ESCALATION_2H", "TICKET_ESCALATION_8H":
		return pref.TicketReplyPush
	case "SERVER_EXPIRY", "SERVER_TRANSFER", "SERVER_STATUS", "COUPON_EXPIRY":
		return pref.ServerExpiryPush
	case "BALANCE_CHANGE", "COMMISSION", "INVITE_REWARD", "INVITEE_BONUS":
		return pref.BalanceChangePush
	case "SECURITY_ALERT", "PASSWORD_RESET":
		return pref.SecurityAlertPush
	default:
		return true
	}
}

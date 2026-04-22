package service

import (
	"errors"
	"fmt"
	"log"
	"net/smtp"
	"strings"
)

var ErrEmailServiceNotConfigured = errors.New("email service is not configured")

// sanitizeEmailHeader removes CRLF characters to prevent header injection
func sanitizeEmailHeader(s string) string {
	return strings.NewReplacer(
		"\r", "",
		"\n", "",
	).Replace(s)
}

type EmailService struct {
	defaultHost     string
	defaultPort     string
	defaultUser     string
	defaultPassword string
	defaultFrom     string
}

type emailRuntimeConfig struct {
	host     string
	port     string
	user     string
	password string
	from     string
}

func NewEmailService(host, port, user, password, from string) *EmailService {
	return &EmailService{
		defaultHost:     host,
		defaultPort:     port,
		defaultUser:     user,
		defaultPassword: password,
		defaultFrom:     from,
	}
}

func (e *EmailService) runtimeConfig() emailRuntimeConfig {
	settings := loadRuntimeSettings("smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from")
	return emailRuntimeConfig{
		host:     runtimeSettingOr(settings, "smtp_host", e.defaultHost),
		port:     runtimeSettingOr(settings, "smtp_port", e.defaultPort),
		user:     runtimeSettingOr(settings, "smtp_user", e.defaultUser),
		password: runtimeSettingOr(settings, "smtp_password", e.defaultPassword),
		from:     runtimeSettingOr(settings, "smtp_from", e.defaultFrom),
	}
}

func (e *EmailService) IsConfigured() bool {
	cfg := e.runtimeConfig()
	return cfg.host != "" && cfg.user != "" && cfg.password != "" && cfg.from != ""
}

func (e *EmailService) sendPlainMail(to, subject, body string) error {
	cfg := e.runtimeConfig()
	if cfg.port == "" {
		cfg.port = "587"
	}
	if cfg.host == "" || cfg.user == "" || cfg.password == "" || cfg.from == "" {
		return ErrEmailServiceNotConfigured
	}

	// Sanitize headers to prevent injection (body must keep newlines)
	sanitizedTo := sanitizeEmailHeader(to)
	sanitizedSubject := sanitizeEmailHeader(subject)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		cfg.from, sanitizedTo, sanitizedSubject, body)

	auth := smtp.PlainAuth("", cfg.user, cfg.password, cfg.host)
	addr := fmt.Sprintf("%s:%s", cfg.host, cfg.port)

	return smtp.SendMail(addr, auth, cfg.from, []string{to}, []byte(msg))
}

func (e *EmailService) SendVerificationCode(to, code string) error {
	subject := "验证码 - ServerAI"
	body := fmt.Sprintf("您的验证码是: %s\n\n此验证码将在10分钟后过期。", code)
	return e.sendPlainMail(to, subject, body)
}

func (e *EmailService) SendResetCode(to, code string) error {
	subject := "密码重置验证码 - ServerAI"
	body := fmt.Sprintf("您的密码重置验证码是: %s\n\n此验证码将在5分钟后过期，请勿泄露给他人。", code)
	return e.sendPlainMail(to, subject, body)
}

func (e *EmailService) SendTicketNotification(to, ticketNo, subject, message string) error {
	if !e.IsConfigured() {
		log.Printf("[EMAIL] Ticket notification for %s: %s - %s", to, ticketNo, subject)
		return nil
	}

	emailSubject := fmt.Sprintf("工单通知 #%s - %s", ticketNo, subject)
	body := fmt.Sprintf("您好，\n\n您的工单 #%s 有新的更新：\n\n%s\n\n请登录系统查看详情。", ticketNo, message)
	return e.sendPlainMail(to, emailSubject, body)
}

func (e *EmailService) SendAnnouncement(to, title, content string) error {
	if !e.IsConfigured() {
		log.Printf("[EMAIL] Announcement for %s: %s", to, title)
		return nil
	}

	body := fmt.Sprintf("您好，\n\n%s\n\n%s\n\n请登录系统查看详情。", title, content)
	return e.sendPlainMail(to, title, body)
}

// globalEmailService is the singleton instance set at startup.
var globalEmailService *EmailService

func SetGlobalEmailService(svc *EmailService) {
	globalEmailService = svc
}

func GetEmailService() *EmailService {
	return globalEmailService
}

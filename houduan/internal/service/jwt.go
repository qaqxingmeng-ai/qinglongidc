package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"math/big"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type JWTPayload struct {
	UserID   string `json:"userId"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	Name     string `json:"name"`
	DeviceID string `json:"deviceId,omitempty"`
}

type JWTClaims struct {
	UserID   string `json:"userId"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	Name     string `json:"name"`
	DeviceID string `json:"deviceId,omitempty"`
	jwt.RegisteredClaims
}

type TokenDetails struct {
	Payload   *JWTPayload
	JWTID     string
	ExpiresAt time.Time
}

type RealtimeTokenClaims struct {
	UserID string `json:"userId"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

var jwtSecret []byte

func InitJWT(secret string) {
	jwtSecret = []byte(secret)
}

func SignToken(payload JWTPayload) (string, error) {
	claims := JWTClaims{
		UserID:   payload.UserID,
		Email:    payload.Email,
		Role:     payload.Role,
		Name:     payload.Name,
		DeviceID: payload.DeviceID,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        GenerateID(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func VerifyToken(tokenStr string) (*JWTPayload, error) {
	details, err := VerifyTokenDetails(tokenStr)
	if err != nil {
		return nil, err
	}
	return details.Payload, nil
}

func VerifyTokenDetails(tokenStr string) (*TokenDetails, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*JWTClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	expiresAt := time.Time{}
	if claims.ExpiresAt != nil {
		expiresAt = claims.ExpiresAt.Time
	}

	return &TokenDetails{
		Payload: &JWTPayload{
			UserID:   claims.UserID,
			Email:    claims.Email,
			Role:     claims.Role,
			Name:     claims.Name,
			DeviceID: claims.DeviceID,
		},
		JWTID:     claims.ID,
		ExpiresAt: expiresAt,
	}, nil
}

func SignRealtimeToken(payload JWTPayload) (string, error) {
	claims := RealtimeTokenClaims{
		UserID: payload.UserID,
		Role:   payload.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   payload.UserID,
			Audience:  jwt.ClaimStrings{"realtime"},
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func VerifyRealtimeToken(tokenStr string) (*JWTPayload, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &RealtimeTokenClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*RealtimeTokenClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid realtime token")
	}
	validAudience := false
	for _, aud := range claims.Audience {
		if aud == "realtime" {
			validAudience = true
			break
		}
	}
	if !validAudience {
		return nil, errors.New("invalid realtime audience")
	}
	return &JWTPayload{
		UserID: claims.UserID,
		Role:   claims.Role,
	}, nil
}

// GenerateVerificationCode returns a 6-digit random code.
func GenerateVerificationCode() string {
	code := ""
	for i := 0; i < 6; i++ {
		n, _ := rand.Int(rand.Reader, big.NewInt(10))
		code += string(rune('0' + n.Int64()))
	}
	return code
}

// GenerateInviteCode returns a 6-char alphanumeric code.
func GenerateInviteCode() string {
	chars := "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	code := make([]byte, 6)
	for i := range code {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		code[i] = chars[n.Int64()]
	}
	return string(code)
}

// GenerateCSRFToken returns a secure random token for CSRF double-submit checks.
func GenerateCSRFToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return GenerateID()
	}
	return hex.EncodeToString(b)
}

// GenerateID returns a cuid-like random ID (26 chars).
func GenerateID() string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 25)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}
	return "c" + string(b)
}

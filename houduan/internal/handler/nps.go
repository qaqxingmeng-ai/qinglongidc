package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

// POST /api/nps
func NpsSubmit(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req struct {
		Score  int     `json:"score" binding:"required,min=0,max=10"`
		Reason *string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp := model.NpsResponse{
		ID:     service.GenerateID(),
		UserID: userID,
		Score:  req.Score,
		Reason: req.Reason,
	}
	if err := database.DB.Create(&resp).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交失败"})
		return
	}

	// Mark NPS notification as read (if triggered via notification)
	database.DB.Model(&model.Notification{}).
		Where("user_id = ? AND type = ? AND is_read = false", userID, "NPS_SURVEY").
		Update("is_read", true)

	c.JSON(http.StatusOK, gin.H{"success": true})
}

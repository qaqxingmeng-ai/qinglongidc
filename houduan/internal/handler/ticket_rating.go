package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"serverai-backend/internal/database"
	"serverai-backend/internal/middleware"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

// POST /api/tickets/:id/rating
func TicketRatingCreate(c *gin.Context) {
	userID := middleware.GetUserID(c)
	ticketID := c.Param("id")

	var req struct {
		Rating   int     `json:"rating" binding:"required,min=1,max=5"`
		Feedback *string `json:"feedback"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "rating 必须为 1-5 的整数"}})
		return
	}
	if req.Feedback != nil && len(*req.Feedback) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "反馈内容不超过 200 字"}})
		return
	}

	// Verify ticket belongs to this user and is CLOSED/RESOLVED
	var ticket model.Ticket
	if err := database.DB.First(&ticket, "id = ? AND user_id = ?", ticketID, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": "工单不存在"}})
		return
	}
	if ticket.Status != "CLOSED" && ticket.Status != "RESOLVED" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "只能对已关闭或已解决的工单进行评价"}})
		return
	}

	// Check if already rated
	var existing model.TicketRating
	if err := database.DB.First(&existing, "ticket_id = ?", ticketID).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "该工单已评价"}})
		return
	}

	rating := model.TicketRating{
		ID:        service.GenerateID(),
		TicketID:  ticketID,
		UserID:    userID,
		Rating:    req.Rating,
		Feedback:  req.Feedback,
		CreatedAt: time.Now(),
	}
	if err := database.DB.Create(&rating).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"message": "评价提交失败"}})
		return
	}

	// Mark rating notification as read (if any)
	database.DB.Model(&model.Notification{}).
		Where("user_id = ? AND related_type = ? AND related_id = ?", userID, "ticket_rating", ticketID).
		Update("is_read", true)

	c.JSON(http.StatusOK, gin.H{"rating": rating})
}

// GET /api/tickets/:id/rating
func TicketRatingGet(c *gin.Context) {
	userID := middleware.GetUserID(c)
	ticketID := c.Param("id")

	// Verify ticket belongs to user
	var ticket model.Ticket
	if err := database.DB.First(&ticket, "id = ? AND user_id = ?", ticketID, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": "工单不存在"}})
		return
	}

	var rating model.TicketRating
	if err := database.DB.First(&rating, "ticket_id = ?", ticketID).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"rating": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rating": rating})
}

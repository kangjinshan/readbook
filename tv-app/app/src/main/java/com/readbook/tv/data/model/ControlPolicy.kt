package com.readbook.tv.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * 书签数据模型
 */
@Entity(
    tableName = "bookmarks",
    foreignKeys = [
        ForeignKey(
            entity = Book::class,
            parentColumns = ["id"],
            childColumns = ["bookId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["bookId", "pageNumber"])]
)
data class Bookmark(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val bookId: Long,
    val pageNumber: Int,
    val chapterIndex: Int? = null,
    val previewText: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val serverId: Long? = null, // 服务端书签 ID
    val syncStatus: SyncStatus = SyncStatus.SYNCED
)

/**
 * 防沉迷策略数据模型
 */
data class ControlPolicy(
    val dailyLimitMinutes: Int = 120,
    val continuousLimitMinutes: Int = 45,
    val restMinutes: Int = 15,
    val forbiddenStartTime: String? = "22:00",
    val forbiddenEndTime: String? = "07:00",
    val allowedFontSizes: List<String> = listOf("small", "medium", "large"),
    val allowedThemes: List<String> = listOf("yellow", "white", "dark")
)

/**
 * 阅读会话状态
 */
data class ReadingSessionState(
    val sessionId: String? = null,
    val bookId: Long = 0,
    val startPage: Int = 1,
    val currentPage: Int = 1,
    val startTime: Long = System.currentTimeMillis(),
    val durationSeconds: Long = 0,
    val isActive: Boolean = false
)

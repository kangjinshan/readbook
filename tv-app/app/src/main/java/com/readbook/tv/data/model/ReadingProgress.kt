package com.readbook.tv.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * 阅读进度数据模型
 * 本地存储，与服务器同步
 */
@Entity(
    tableName = "reading_progress",
    foreignKeys = [
        ForeignKey(
            entity = Book::class,
            parentColumns = ["id"],
            childColumns = ["bookId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["bookId"], unique = true)]
)
data class ReadingProgress(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val bookId: Long,
    val currentPage: Int = 1,
    val currentChapter: Int = 1,
    val totalTimeSeconds: Long = 0,
    val lastReadAt: Long = System.currentTimeMillis(),
    val syncStatus: SyncStatus = SyncStatus.SYNCED,
    val updatedAt: Long = System.currentTimeMillis()
) {
    /**
     * 是否需要同步
     */
    fun needsSync(): Boolean = syncStatus == SyncStatus.PENDING
}

/**
 * 同步状态
 */
enum class SyncStatus {
    SYNCED,      // 已同步
    PENDING,     // 待同步
    SYNCING      // 同步中
}

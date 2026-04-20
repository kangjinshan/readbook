package com.readbook.tv.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName

/**
 * 书籍数据模型
 * 对应服务端 books 表
 */
@Entity(tableName = "books")
data class Book(
    @PrimaryKey
    val id: Long,
    val title: String,
    val author: String?,
    val coverUrl: String?,
    val totalPages: Int,
    val totalChapters: Int?,
    val format: String = "EPUB", // EPUB, PDF, TXT
    val downloaded: Boolean = false,
    val downloadedAt: Long? = null,
    val updatedAt: Long = System.currentTimeMillis()
) {
    /**
     * 获取封面本地路径
     */
    fun getLocalCoverPath(): String? {
        return if (downloaded) "books/$id/cover.jpg" else null
    }
}

/**
 * 书籍列表响应
 */
data class BookListResponse(
    val id: Long,
    val title: String,
    val author: String?,
    @SerializedName("coverUrl")
    val coverUrl: String?,
    @SerializedName("totalPages")
    val totalPages: Int,
    @SerializedName("totalChapters")
    val totalChapters: Int?,
    val format: String = "EPUB",
    val progress: ReadingProgressInfo?
)

/**
 * 阅读进度信息
 */
data class ReadingProgressInfo(
    @SerializedName("currentPage")
    val currentPage: Int,
    @SerializedName("lastReadAt")
    val lastReadAt: String?
)

/**
 * 同步响应中的书籍数据
 */
data class SyncBookData(
    val id: Long,
    val title: String,
    val author: String?,
    @SerializedName("coverUrl")
    val coverUrl: String?,
    @SerializedName("totalPages")
    val totalPages: Int,
    @SerializedName("totalChapters")
    val totalChapters: Int?,
    val format: String = "EPUB",
    val progress: ReadingProgressInfo?
)

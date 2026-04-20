package com.readbook.tv.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * 章节数据模型
 * 对应服务端 chapters 表
 */
@Entity(
    tableName = "chapters",
    foreignKeys = [
        ForeignKey(
            entity = Book::class,
            parentColumns = ["id"],
            childColumns = ["bookId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["bookId"])]
)
data class Chapter(
    @PrimaryKey
    val id: Long,
    val bookId: Long,
    val chapterIndex: Int,
    val title: String?,
    val startPage: Int,
    val endPage: Int,
    val content: String? = null, // 下载后存储的内容
    val contentBlocksJson: String? = null,
    val renderMode: String? = null,
    val renderBaseUrl: String? = null,
    val renderHtml: String? = null,
    val renderCssJson: String? = null,
    val downloaded: Boolean = false
) {
    /**
     * 章节页数
     */
    val pageCount: Int
        get() = endPage - startPage + 1
}

/**
 * 章节列表响应
 */
data class ChapterResponse(
    val index: Int,
    val title: String?,
    val pages: Int
)

/**
 * 章节内容响应
 */
data class ChapterContentResponse(
    val chapter: Int,
    val title: String?,
    val content: String
)

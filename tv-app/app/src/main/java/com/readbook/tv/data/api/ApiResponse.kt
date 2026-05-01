package com.readbook.tv.data.api

import com.google.gson.annotations.SerializedName

/**
 * API 通用响应包装
 */
data class ApiResponse<T>(
    @SerializedName("code")
    val code: Int,
    @SerializedName("data")
    val data: T?,
    @SerializedName("message")
    val message: String?
) {
    fun isSuccess(): Boolean = code == 0

    fun getErrorMessage(): String = message ?: "未知错误"
}

/**
 * 注册响应
 */
data class RegisterResponse(
    @SerializedName("registered")
    val registered: Boolean,
    @SerializedName("bound")
    val bound: Boolean,
    @SerializedName("deviceToken")
    val deviceToken: String?
)

/**
 * 绑定状态响应
 */
data class BindStatusResponse(
    @SerializedName("bound")
    val bound: Boolean,
    @SerializedName("bindCode")
    val bindCode: String?,
    @SerializedName("expiresIn")
    val expiresIn: Int?,
    @SerializedName("child")
    val child: ChildInfo?,
    @SerializedName("admin")
    val admin: AdminInfo?
)

/**
 * 子账号信息
 */
data class ChildInfo(
    @SerializedName("id")
    val id: Long,
    @SerializedName("name")
    val name: String
)

/**
 * 管理员信息
 */
data class AdminInfo(
    @SerializedName("username")
    val username: String
)

/**
 * 同步响应
 */
data class SyncResponse(
    @SerializedName("child")
    val child: ChildInfo?,
    @SerializedName("books")
    val books: List<BookData>?,
    @SerializedName("policy")
    val policy: PolicyData?,
    @SerializedName("dailyReadingResetAt")
    val dailyReadingResetAt: String?,
    @SerializedName("remoteCommand")
    val remoteCommand: String?
)

/**
 * 书籍数据
 */
data class BookData(
    @SerializedName("id")
    val id: Long,
    @SerializedName("title")
    val title: String,
    @SerializedName("author")
    val author: String?,
    @SerializedName("coverUrl")
    val coverUrl: String?,
    @SerializedName("format")
    val format: String?,
    @SerializedName("totalPages")
    val totalPages: Int,
    @SerializedName("totalChapters")
    val totalChapters: Int?,
    @SerializedName("progress")
    val progress: ProgressData?,
    @SerializedName("bookmarks")
    val bookmarks: List<BookmarkData>?
)

/**
 * 进度数据
 */
data class ProgressData(
    @SerializedName("currentPage")
    val currentPage: Int,
    @SerializedName("lastReadAt")
    val lastReadAt: String?
)

/**
 * 策略数据
 */
data class PolicyData(
    @SerializedName("dailyLimitMinutes")
    val dailyLimitMinutes: Int,
    @SerializedName("continuousLimitMinutes")
    val continuousLimitMinutes: Int,
    @SerializedName("restMinutes")
    val restMinutes: Int,
    @SerializedName("forbiddenStartTime")
    val forbiddenStartTime: String?,
    @SerializedName("forbiddenEndTime")
    val forbiddenEndTime: String?,
    @SerializedName("allowedFontSizes")
    val allowedFontSizes: List<String>?,
    @SerializedName("allowedThemes")
    val allowedThemes: List<String>?
)

/**
 * 会话开始响应
 */
data class SessionStartResponse(
    @SerializedName("sessionId")
    val sessionId: String,
    @SerializedName("allowed")
    val allowed: Boolean,
    @SerializedName("reason")
    val reason: String?,
    @SerializedName("message")
    val message: String?,
    @SerializedName("lockDurationMinutes")
    val lockDurationMinutes: Int?,
    @SerializedName("policy")
    val policy: PolicyData?,
    @SerializedName("todayReadMinutes")
    val todayReadMinutes: Int,
    @SerializedName("continuousReadMinutes")
    val continuousReadMinutes: Int?,
    @SerializedName("continuousReadSeconds")
    val continuousReadSeconds: Long?
)

/**
 * 心跳响应
 */
data class HeartbeatResponse(
    @SerializedName("shouldLock")
    val shouldLock: Boolean,
    @SerializedName("reason")
    val reason: String?,
    @SerializedName("lockDurationMinutes")
    val lockDurationMinutes: Int,
    @SerializedName("message")
    val message: String?,
    @SerializedName("remainingContinuousMinutes")
    val remainingContinuousMinutes: Int,
    @SerializedName("remainingDailyMinutes")
    val remainingDailyMinutes: Int,
    @SerializedName("remoteCommand")
    val remoteCommand: String?
)

/**
 * 章节列表响应
 */
data class ChapterListResponse(
    @SerializedName("chapters")
    val chapters: List<ChapterData>
)

/**
 * 章节数据
 */
data class ChapterData(
    @SerializedName("index")
    val index: Int,
    @SerializedName("title")
    val title: String?,
    @SerializedName("pages")
    val pages: Int
)

/**
 * 章节内容响应
 */
data class ChapterContentData(
    @SerializedName("chapter")
    val chapter: Int,
    @SerializedName("title")
    val title: String?,
    @SerializedName("startPage")
    val startPage: Int,
    @SerializedName("endPage")
    val endPage: Int,
    @SerializedName("content")
    val content: String,
    @SerializedName("contentBlocks")
    val contentBlocks: List<ChapterContentBlockData>?,
    @SerializedName("renderMode")
    val renderMode: String? = null,
    @SerializedName("renderBaseUrl")
    val renderBaseUrl: String? = null,
    @SerializedName("renderHtml")
    val renderHtml: String? = null,
    @SerializedName("renderCss")
    val renderCss: List<String>? = null,
)

data class ChapterContentBlockData(
    @SerializedName("type")
    val type: String,
    @SerializedName("text")
    val text: String? = null,
    @SerializedName("assetUrl")
    val assetUrl: String? = null,
    @SerializedName("alt")
    val alt: String? = null,
    @SerializedName("width")
    val width: Int? = null,
    @SerializedName("height")
    val height: Int? = null,
    @SerializedName("widthPercent")
    val widthPercent: Float? = null,
)

/**
 * 页面内容响应
 */
data class PageContentResponse(
    @SerializedName("page")
    val page: Int,
    @SerializedName("chapter")
    val chapter: Int,
    @SerializedName("content")
    val content: String,
    @SerializedName("bookmarks")
    val bookmarks: List<BookmarkData>?
)

/**
 * 书签数据
 */
data class BookmarkData(
    @SerializedName(value = "id", alternate = ["bookmark_id"])
    val id: Long,
    @SerializedName(value = "pageNumber", alternate = ["page_number"])
    val pageNumber: Int,
    @SerializedName(value = "previewText", alternate = ["preview_text"])
    val previewText: String?,
    @SerializedName(value = "createdAt", alternate = ["created_at"])
    val createdAt: String?
)

/**
 * 书签响应
 */
data class BookmarkResponse(
    @SerializedName("bookmarkId")
    val id: Long,
    @SerializedName("bookId")
    val bookId: Long,
    @SerializedName("pageNumber")
    val pageNumber: Int,
    @SerializedName("previewText")
    val previewText: String?,
    @SerializedName("createdAt")
    val createdAt: String?
)

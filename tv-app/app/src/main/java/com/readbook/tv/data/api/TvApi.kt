package com.readbook.tv.data.api

import com.google.gson.annotations.SerializedName
import com.readbook.tv.data.api.*
import retrofit2.http.*

/**
 * 电视端 API 接口定义
 */
interface TvApi {

    /**
     * 设备注册
     */
    @POST("api/tv/register")
    suspend fun register(
        @Body request: RegisterRequest
    ): ApiResponse<RegisterResponse>

    /**
     * 获取绑定状态
     */
    @GET("api/tv/bind-status")
    suspend fun getBindStatus(): ApiResponse<BindStatusResponse>

    /**
     * 同步数据
     */
    @GET("api/tv/sync")
    suspend fun sync(): ApiResponse<SyncResponse>

    /**
     * 获取书籍章节列表
     */
    @GET("api/tv/books/{bookId}/chapters")
    suspend fun getChapters(
        @Path("bookId") bookId: Long
    ): ApiResponse<ChapterListResponse>

    /**
     * 获取章节全文内容
     */
    @GET("api/tv/books/{bookId}/chapters/{chapterIndex}/content")
    suspend fun getChapterContent(
        @Path("bookId") bookId: Long,
        @Path("chapterIndex") chapterIndex: Int
    ): ApiResponse<ChapterContentData>

    /**
     * 获取页面内容
     */
    @GET("api/tv/books/{bookId}/pages/{page}")
    suspend fun getPageContent(
        @Path("bookId") bookId: Long,
        @Path("page") page: Int
    ): ApiResponse<PageContentResponse>

    /**
     * 开始阅读会话
     */
    @POST("api/tv/session/start")
    suspend fun startSession(
        @Body request: SessionStartRequest
    ): ApiResponse<SessionStartResponse>

    /**
     * 阅读会话心跳
     */
    @POST("api/tv/session/heartbeat")
    suspend fun heartbeat(
        @Body request: HeartbeatRequest
    ): ApiResponse<HeartbeatResponse>

    /**
     * 结束阅读会话
     */
    @POST("api/tv/session/end")
    suspend fun endSession(
        @Body request: SessionEndRequest
    ): ApiResponse<Unit>

    /**
     * 添加书签
     */
    @POST("api/tv/bookmarks")
    suspend fun addBookmark(
        @Body request: AddBookmarkRequest
    ): ApiResponse<BookmarkResponse>

    /**
     * 删除书签
     */
    @DELETE("api/tv/bookmarks/{bookmarkId}")
    suspend fun deleteBookmark(
        @Path("bookmarkId") bookmarkId: Long
    ): ApiResponse<Unit>
}

// Request classes

data class RegisterRequest(
    @SerializedName("deviceToken")
    val deviceToken: String
)

data class SessionStartRequest(
    @SerializedName("bookId")
    val bookId: Long,
    @SerializedName("startPage")
    val startPage: Int
)

data class HeartbeatRequest(
    @SerializedName("sessionId")
    val sessionId: String,
    @SerializedName("currentPage")
    val currentPage: Int,
    @SerializedName("durationSeconds")
    val durationSeconds: Long
)

data class SessionEndRequest(
    @SerializedName("sessionId")
    val sessionId: String,
    @SerializedName("endPage")
    val endPage: Int
)

data class AddBookmarkRequest(
    @SerializedName("bookId")
    val bookId: Long,
    @SerializedName("pageNumber")
    val pageNumber: Int,
    @SerializedName("previewText")
    val previewText: String?
)

package com.readbook.tv.data.repository

import android.util.Log
import com.readbook.tv.data.api.*
import com.readbook.tv.data.local.BookmarkDao
import com.readbook.tv.data.local.ChapterDao
import com.readbook.tv.data.local.ProgressDao
import com.readbook.tv.data.model.Bookmark
import com.readbook.tv.data.model.ControlPolicy
import com.readbook.tv.data.model.ReadingProgress
import com.readbook.tv.data.model.SyncStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 同步数据仓库
 * 处理设备注册、绑定、数据同步
 */
class SyncRepository(
    private val api: TvApi,
    private val bookRepository: BookRepository,
    private val chapterDao: ChapterDao,
    private val progressDao: ProgressDao,
    private val bookmarkDao: BookmarkDao,
    private val onPolicySynced: ((ControlPolicy) -> Unit)? = null
) {
    companion object {
        private const val TAG = "SyncRepository"
    }

    private fun parseServerTimestamp(value: String?): Long? =
        value?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }

    /**
     * 设备注册
     */
    suspend fun registerDevice(deviceToken: String): Result<RegisterResponse> {
        return withContext(Dispatchers.IO) {
            try {
                val response = api.register(RegisterRequest(deviceToken))
                if (response.isSuccess() && response.data != null) {
                    Result.success(response.data)
                } else {
                    Result.failure(Exception(response.getErrorMessage()))
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    /**
     * 获取绑定状态
     */
    suspend fun getBindStatus(): Result<BindStatusResponse> {
        return withContext(Dispatchers.IO) {
            try {
                val response = api.getBindStatus()
                if (response.isSuccess() && response.data != null) {
                    Result.success(response.data)
                } else {
                    Result.failure(Exception(response.getErrorMessage()))
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    /**
     * 同步所有数据
     */
    suspend fun sync(): Result<SyncResult> {
        return withContext(Dispatchers.IO) {
            try {
                val response = api.sync()
                if (response.isSuccess() && response.data != null) {
                    val data = response.data
                    val serverBookCount = data.books?.size ?: 0
                    Log.i(TAG, "sync success, server returned $serverBookCount books")

                    // 保存书籍数据
                    data.books?.let { books ->
                        bookRepository.saveBooks(books)
                        Log.i(
                            TAG,
                            "sync persisted ${books.size} books, local database now has ${bookRepository.getBookCount()} books"
                        )
                    }
                    syncPendingBookmarks()

                    // 构建策略对象
                    val policy = data.policy?.let { p ->
                        ControlPolicy(
                            dailyLimitMinutes = p.dailyLimitMinutes,
                            continuousLimitMinutes = p.continuousLimitMinutes,
                            restMinutes = p.restMinutes,
                            forbiddenStartTime = p.forbiddenStartTime,
                            forbiddenEndTime = p.forbiddenEndTime,
                            allowedFontSizes = p.allowedFontSizes ?: listOf("small", "medium", "large"),
                            allowedThemes = p.allowedThemes ?: listOf("yellow", "white", "dark")
                        )
                    }
                    policy?.let { onPolicySynced?.invoke(it) }

                    Result.success(
                        SyncResult(
                            child = data.child,
                            policy = policy,
                            dailyReadingResetAtEpochMs = parseServerTimestamp(data.dailyReadingResetAt),
                            remoteCommand = data.remoteCommand
                        )
                    )
                } else {
                    Log.w(TAG, "sync failed: ${response.getErrorMessage()}")
                    Result.failure(Exception(response.getErrorMessage()))
                }
            } catch (e: Exception) {
                Log.e(TAG, "sync exception", e)
                Result.failure(e)
            }
        }
    }

    private suspend fun syncPendingBookmarks() {
        val pendingBookmarks = bookRepository.getPendingBookmarks()
        if (pendingBookmarks.isEmpty()) {
            return
        }

        pendingBookmarks.forEach { bookmark ->
            val result = syncBookmark(bookmark)
            if (result.isFailure) {
                Log.w(
                    TAG,
                    "sync pending bookmark failed, bookId=${bookmark.bookId}, page=${bookmark.pageNumber}",
                    result.exceptionOrNull()
                )
            }
        }
    }

    /**
     * 同步进度到服务器
     */
    suspend fun syncProgress(progress: ReadingProgress): Result<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                Result.failure(IllegalStateException("阅读进度需要通过阅读会话心跳同步到服务器"))
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    /**
     * 同步书签到服务器
     */
    suspend fun syncBookmark(bookmark: Bookmark): Result<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                if (bookmark.serverId != null) {
                    // 已有服务端 ID，跳过
                    return@withContext Result.success(Unit)
                }

                val response = api.addBookmark(
                    AddBookmarkRequest(
                        bookId = bookmark.bookId,
                        pageNumber = bookmark.pageNumber,
                        previewText = bookmark.previewText
                    )
                )
                if (response.isSuccess() && response.data != null) {
                    bookmarkDao.updateBookmark(
                        bookmark.copy(
                            serverId = response.data.id,
                            syncStatus = SyncStatus.SYNCED
                        )
                    )
                    Result.success(Unit)
                } else {
                    Result.failure(Exception(response.getErrorMessage()))
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    /**
     * 清空本地数据
     */
    suspend fun clearLocalData() {
        withContext(Dispatchers.IO) {
            bookRepository.deleteAllBooks()
            chapterDao.deleteAllChapters()
            progressDao.deleteAllProgress()
            bookmarkDao.deleteAllBookmarks()
        }
    }
}

/**
 * 同步结果
 */
data class SyncResult(
    val child: ChildInfo?,
    val policy: ControlPolicy?,
    val dailyReadingResetAtEpochMs: Long?,
    val remoteCommand: String?
)

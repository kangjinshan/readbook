package com.readbook.tv.data.repository

import androidx.room.withTransaction
import com.readbook.tv.data.api.*
import com.readbook.tv.data.local.*
import com.readbook.tv.data.model.*
import com.readbook.tv.ui.shelf.ShelfBookItem
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.Flow
import java.io.File

/**
 * 书籍数据仓库
 * 统一管理书籍、章节、进度、书签数据
 */
class BookRepository(
    private val database: AppDatabase,
    private val bookDao: BookDao,
    private val chapterDao: ChapterDao,
    private val progressDao: ProgressDao,
    private val bookmarkDao: BookmarkDao,
    private val api: TvApi
) {
    private fun parseServerTimestamp(value: String?): Long {
        return value?.let {
            runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull()
        } ?: System.currentTimeMillis()
    }

    // ==================== 书籍操作 ====================

    /**
     * 获取所有书籍
     */
    fun getAllBooks(): Flow<List<Book>> = bookDao.getAllBooks()

    /**
     * 获取书架展示数据
     */
    fun getShelfBooks(): Flow<List<ShelfBookItem>> =
        combine(bookDao.getAllBooks(), progressDao.getAllProgress()) { books, progressList ->
            val progressByBookId = progressList.associateBy { it.bookId }
            books.map { book ->
                ShelfBookItem(
                    book = book,
                    progress = progressByBookId[book.id]
                )
            }
        }

    /**
     * 根据 ID 获取书籍
     */
    suspend fun getBookById(bookId: Long): Book? = bookDao.getBookById(bookId)

    /**
     * 保存书籍列表（从同步数据）- 使用事务确保原子性
     */
    suspend fun saveBooks(books: List<BookData>) = database.withTransaction {
        val removedBookIds = findRemovedBookIds(bookDao.getAllBookIds(), books)
        removedBookIds.forEach { bookId ->
            bookDao.deleteBookById(bookId)
            chapterDao.deleteChaptersByBookId(bookId)
            bookmarkDao.deleteBookmarksByBookId(bookId)
            progressDao.deleteProgressByBookId(bookId)
        }

        val entities = books.map { data ->
            Book(
                id = data.id,
                title = data.title,
                author = data.author,
                coverUrl = data.coverUrl,
                totalPages = data.totalPages,
                totalChapters = data.totalChapters,
                format = data.format ?: "EPUB",
                downloaded = false
            )
        }
        bookDao.insertBooks(entities)

        // 保存进度
        books.forEach { data ->
            data.progress?.let { progress ->
                progressDao.insertProgress(
                    ReadingProgress(
                        bookId = data.id,
                        currentPage = progress.currentPage,
                        lastReadAt = parseServerTimestamp(progress.lastReadAt)
                    )
                )
            }
            data.bookmarks?.let { bookmarks ->
                syncBookmarksForBook(data.id, bookmarks)
            }
        }
    }

    /**
     * 更新书籍下载状态
     */
    suspend fun updateDownloadStatus(bookId: Long, downloaded: Boolean) {
        bookDao.updateDownloadStatus(
            bookId = bookId,
            downloaded = downloaded,
            downloadedAt = if (downloaded) System.currentTimeMillis() else null
        )
    }

    /**
     * 删除书籍（使用事务确保原子性）
     */
    suspend fun deleteBook(bookId: Long) = database.withTransaction {
        bookDao.deleteBookById(bookId)
        chapterDao.deleteChaptersByBookId(bookId)
        bookmarkDao.deleteBookmarksByBookId(bookId)
        progressDao.deleteProgressByBookId(bookId)
    }

    suspend fun deleteAllBooks() {
        bookDao.deleteAllBooks()
    }

    suspend fun getBookCount(): Int = bookDao.getBookCount()

    // ==================== 章节操作 ====================

    /**
     * 获取书籍章节列表
     */
    suspend fun getChapters(bookId: Long): List<Chapter> {
        // 先从本地获取
        var chapters = chapterDao.getChaptersByBookId(bookId)

        // 如果本地没有，从服务器获取
        if (chapters.isEmpty()) {
            val response = api.getChapters(bookId)
            if (response.isSuccess() && response.data != null) {
                var currentPage = 1
                val entities = response.data.chapters.map { data ->
                    val startPage = currentPage
                    val endPage = currentPage + data.pages - 1
                    currentPage = endPage + 1
                    Chapter(
                        id = (bookId shl 20) + data.index.toLong(),
                        bookId = bookId,
                        chapterIndex = data.index,
                        title = data.title,
                        startPage = startPage,
                        endPage = endPage
                    )
                }
                chapterDao.insertChapters(entities)
                chapters = entities
            }
        }

        return chapters
    }

    /**
     * 获取章节（Flow）
     */
    fun getChaptersFlow(bookId: Long): Flow<List<Chapter>> =
        chapterDao.getChaptersByBookIdFlow(bookId)

    // ==================== 阅读进度操作 ====================

    /**
     * 获取阅读进度
     */
    suspend fun getProgress(bookId: Long): ReadingProgress? =
        progressDao.getProgressByBookId(bookId)

    /**
     * 获取阅读进度（Flow）
     */
    fun getProgressFlow(bookId: Long): Flow<ReadingProgress?> =
        progressDao.getProgressByBookIdFlow(bookId)

    /**
     * 更新当前页
     */
    suspend fun updateCurrentPage(bookId: Long, page: Int) {
        val existing = progressDao.getProgressByBookId(bookId)
        if (existing != null) {
            progressDao.updateCurrentPage(
                bookId = bookId,
                page = page,
                updatedAt = System.currentTimeMillis(),
                syncStatus = SyncStatus.PENDING
            )
        } else {
            progressDao.insertProgress(
                ReadingProgress(
                    bookId = bookId,
                    currentPage = page,
                    syncStatus = SyncStatus.PENDING
                )
            )
        }
    }

    /**
     * 增加阅读时长
     */
    suspend fun addReadingTime(bookId: Long, seconds: Long) {
        val existing = progressDao.getProgressByBookId(bookId)
        if (existing != null) {
            progressDao.addReadingTime(
                bookId = bookId,
                additionalSeconds = seconds,
                updatedAt = System.currentTimeMillis(),
                syncStatus = SyncStatus.PENDING
            )
        } else {
            progressDao.insertProgress(
                ReadingProgress(
                    bookId = bookId,
                    totalTimeSeconds = seconds,
                    syncStatus = SyncStatus.PENDING
                )
            )
        }
    }

    /**
     * 获取待同步的进度
     */
    suspend fun getPendingProgress(): List<ReadingProgress> =
        progressDao.getProgressBySyncStatus(SyncStatus.PENDING)

    // ==================== 书签操作 ====================

    /**
     * 获取书籍书签
     */
    fun getBookmarks(bookId: Long): Flow<List<Bookmark>> =
        bookmarkDao.getBookmarksByBookId(bookId)

    /**
     * 检查页码是否已添加书签
     */
    suspend fun hasBookmark(bookId: Long, pageNumber: Int): Boolean =
        bookmarkDao.getBookmarkByPage(bookId, pageNumber) != null

    /**
     * 添加书签
     */
    suspend fun addBookmark(bookId: Long, pageNumber: Int, previewText: String?): Bookmark? {
        val savedBookmark = addBookmarkLocal(bookId, pageNumber, previewText) ?: return null
        if (savedBookmark.serverId != null) {
            return savedBookmark
        }

        // 尝试同步到服务器
        try {
            val response = api.addBookmark(
                AddBookmarkRequest(
                    bookId = bookId,
                    pageNumber = pageNumber,
                    previewText = previewText
                )
            )
            if (response.isSuccess() && response.data != null) {
                // 更新服务端 ID
                bookmarkDao.updateBookmark(
                    savedBookmark.copy(
                        serverId = response.data.id,
                        syncStatus = SyncStatus.SYNCED
                    )
                )
            }
        } catch (e: Exception) {
            // 保持待同步状态
        }

        return savedBookmark
    }

    /**
     * 仅在本地创建书签，供强制休息等需要立即保底的位置保存场景使用。
     */
    suspend fun addBookmarkLocal(bookId: Long, pageNumber: Int, previewText: String?): Bookmark? {
        val existing = bookmarkDao.getBookmarkByPage(bookId, pageNumber)
        if (existing != null) return existing

        val bookmark = Bookmark(
            bookId = bookId,
            pageNumber = pageNumber,
            previewText = previewText,
            syncStatus = SyncStatus.PENDING
        )
        val id = bookmarkDao.insertBookmark(bookmark)
        return bookmark.copy(id = id)
    }

    /**
     * 删除书签
     */
    suspend fun deleteBookmark(bookmark: Bookmark) {
        // 如果有服务端 ID，先从服务器删除
        bookmark.serverId?.let { serverId ->
            try {
                api.deleteBookmark(serverId)
            } catch (e: Exception) {
                // 忽略错误
            }
        }
        bookmarkDao.deleteBookmark(bookmark)
    }

    suspend fun syncBookmarksForBook(bookId: Long, remoteBookmarks: List<BookmarkData>) {
        val localBookmarks = bookmarkDao.getBookmarksSnapshot(bookId)
        val mergedBookmarks = BookmarkSyncMerge.merge(
            bookId = bookId,
            local = localBookmarks,
            remote = remoteBookmarks,
            parseTimestamp = ::parseServerTimestamp
        )

        bookmarkDao.deleteBookmarksByBookId(bookId)
        if (mergedBookmarks.isNotEmpty()) {
            bookmarkDao.insertBookmarks(mergedBookmarks)
        }
    }

    /**
     * 获取待同步的书签
     */
    suspend fun getPendingBookmarks(): List<Bookmark> =
        bookmarkDao.getBookmarksBySyncStatus(SyncStatus.PENDING)

    // ==================== 页面内容 ====================

    /**
     * 获取指定章节全文内容，并在本地缓存
     */
    suspend fun getChapterContent(bookId: Long, chapterIndex: Int): Chapter? {
        val localChapter = chapterDao.getChapterByIndex(bookId, chapterIndex) ?: return null
        if (
            !localChapter.content.isNullOrBlank()
            || !localChapter.contentBlocksJson.isNullOrBlank()
            || !localChapter.renderHtml.isNullOrBlank()
        ) {
            return localChapter
        }

        return try {
            val response = api.getChapterContent(bookId, chapterIndex)
            if (response.isSuccess() && response.data != null) {
                val contentBlocks = ReaderContentBlocksJson.fromApi(response.data.contentBlocks)
                val renderCssJson = ReaderRenderCssJson.encode(response.data.renderCss.orEmpty())
                chapterDao.updateChapterContent(
                    chapterId = localChapter.id,
                    content = response.data.content,
                    contentBlocksJson = ReaderContentBlocksJson.encode(contentBlocks),
                    renderMode = response.data.renderMode,
                    renderBaseUrl = response.data.renderBaseUrl,
                    renderHtml = response.data.renderHtml,
                    renderCssJson = renderCssJson,
                )
                localChapter.copy(
                    content = response.data.content,
                    contentBlocksJson = ReaderContentBlocksJson.encode(contentBlocks),
                    renderMode = response.data.renderMode,
                    renderBaseUrl = response.data.renderBaseUrl,
                    renderHtml = response.data.renderHtml,
                    renderCssJson = renderCssJson,
                    downloaded = true
                )
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }
}

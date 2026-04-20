package com.readbook.tv.data.local

import androidx.room.*
import com.readbook.tv.data.model.Bookmark
import com.readbook.tv.data.model.SyncStatus
import kotlinx.coroutines.flow.Flow

/**
 * 书签数据访问对象
 */
@Dao
interface BookmarkDao {

    /**
     * 获取书籍的所有书签
     */
    @Query("SELECT * FROM bookmarks WHERE bookId = :bookId ORDER BY pageNumber ASC")
    fun getBookmarksByBookId(bookId: Long): Flow<List<Bookmark>>

    /**
     * 获取书籍的所有书签（一次性）
     */
    @Query("SELECT * FROM bookmarks WHERE bookId = :bookId ORDER BY pageNumber ASC")
    suspend fun getBookmarksSnapshot(bookId: Long): List<Bookmark>

    /**
     * 获取所有书签
     */
    @Query("SELECT * FROM bookmarks ORDER BY createdAt DESC")
    fun getAllBookmarks(): Flow<List<Bookmark>>

    /**
     * 根据 ID 获取书签
     */
    @Query("SELECT * FROM bookmarks WHERE id = :bookmarkId")
    suspend fun getBookmarkById(bookmarkId: Long): Bookmark?

    /**
     * 检查指定页是否已有书签
     */
    @Query("SELECT * FROM bookmarks WHERE bookId = :bookId AND pageNumber = :pageNumber LIMIT 1")
    suspend fun getBookmarkByPage(bookId: Long, pageNumber: Int): Bookmark?

    /**
     * 获取待同步的书签
     */
    @Query("SELECT * FROM bookmarks WHERE syncStatus = :status")
    suspend fun getBookmarksBySyncStatus(status: SyncStatus): List<Bookmark>

    /**
     * 插入书签
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBookmark(bookmark: Bookmark): Long

    /**
     * 批量插入书签
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBookmarks(bookmarks: List<Bookmark>)

    /**
     * 更新书签
     */
    @Update
    suspend fun updateBookmark(bookmark: Bookmark)

    /**
     * 删除书签
     */
    @Delete
    suspend fun deleteBookmark(bookmark: Bookmark)

    /**
     * 根据 ID 删除书签
     */
    @Query("DELETE FROM bookmarks WHERE id = :bookmarkId")
    suspend fun deleteBookmarkById(bookmarkId: Long)

    /**
     * 删除书籍的所有书签
     */
    @Query("DELETE FROM bookmarks WHERE bookId = :bookId")
    suspend fun deleteBookmarksByBookId(bookId: Long)

    /**
     * 清空所有书签
     */
    @Query("DELETE FROM bookmarks")
    suspend fun deleteAllBookmarks()

    /**
     * 获取书签数量
     */
    @Query("SELECT COUNT(*) FROM bookmarks WHERE bookId = :bookId")
    suspend fun getBookmarkCount(bookId: Long): Int
}

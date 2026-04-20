package com.readbook.tv.data.local

import androidx.room.*
import com.readbook.tv.data.model.ReadingProgress
import com.readbook.tv.data.model.SyncStatus
import kotlinx.coroutines.flow.Flow

/**
 * 阅读进度数据访问对象
 */
@Dao
interface ProgressDao {

    /**
     * 获取所有阅读进度
     */
    @Query("SELECT * FROM reading_progress")
    fun getAllProgress(): Flow<List<ReadingProgress>>

    /**
     * 根据书籍 ID 获取进度
     */
    @Query("SELECT * FROM reading_progress WHERE bookId = :bookId LIMIT 1")
    suspend fun getProgressByBookId(bookId: Long): ReadingProgress?

    /**
     * 根据书籍 ID 获取进度（Flow）
     */
    @Query("SELECT * FROM reading_progress WHERE bookId = :bookId LIMIT 1")
    fun getProgressByBookIdFlow(bookId: Long): Flow<ReadingProgress?>

    /**
     * 获取待同步的进度
     */
    @Query("SELECT * FROM reading_progress WHERE syncStatus = :status")
    suspend fun getProgressBySyncStatus(status: SyncStatus): List<ReadingProgress>

    /**
     * 插入或更新进度
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProgress(progress: ReadingProgress)

    /**
     * 更新当前页
     */
    @Query("""
        UPDATE reading_progress
        SET currentPage = :page,
            updatedAt = :updatedAt,
            syncStatus = :syncStatus
        WHERE bookId = :bookId
    """)
    suspend fun updateCurrentPage(bookId: Long, page: Int, updatedAt: Long, syncStatus: SyncStatus)

    /**
     * 增加阅读时长
     */
    @Query("""
        UPDATE reading_progress
        SET totalTimeSeconds = totalTimeSeconds + :additionalSeconds,
            updatedAt = :updatedAt,
            syncStatus = :syncStatus
        WHERE bookId = :bookId
    """)
    suspend fun addReadingTime(bookId: Long, additionalSeconds: Long, updatedAt: Long, syncStatus: SyncStatus)

    /**
     * 更新同步状态
     */
    @Query("UPDATE reading_progress SET syncStatus = :status WHERE id = :progressId")
    suspend fun updateSyncStatus(progressId: Long, status: SyncStatus)

    /**
     * 删除进度
     */
    @Query("DELETE FROM reading_progress WHERE bookId = :bookId")
    suspend fun deleteProgressByBookId(bookId: Long)

    /**
     * 清空所有进度
     */
    @Query("DELETE FROM reading_progress")
    suspend fun deleteAllProgress()
}

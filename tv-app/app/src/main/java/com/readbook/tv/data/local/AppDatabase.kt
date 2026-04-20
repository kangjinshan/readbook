package com.readbook.tv.data.local

import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.readbook.tv.data.model.Book
import com.readbook.tv.data.model.Chapter
import com.readbook.tv.data.model.Bookmark
import com.readbook.tv.data.model.ReadingProgress
import kotlinx.coroutines.flow.Flow

/**
 * 应用数据库
 * Room 数据库主类
 */
@Database(
    entities = [
        Book::class,
        Chapter::class,
        Bookmark::class,
        ReadingProgress::class
    ],
    version = 3,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun bookDao(): BookDao
    abstract fun chapterDao(): ChapterDao
    abstract fun bookmarkDao(): BookmarkDao
    abstract fun progressDao(): ProgressDao
}

val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE chapters ADD COLUMN contentBlocksJson TEXT")
    }
}

val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE chapters ADD COLUMN renderMode TEXT")
        db.execSQL("ALTER TABLE chapters ADD COLUMN renderBaseUrl TEXT")
        db.execSQL("ALTER TABLE chapters ADD COLUMN renderHtml TEXT")
        db.execSQL("ALTER TABLE chapters ADD COLUMN renderCssJson TEXT")
    }
}

/**
 * 章节数据访问对象
 */
@Dao
interface ChapterDao {

    @Query("SELECT * FROM chapters WHERE bookId = :bookId ORDER BY chapterIndex ASC")
    suspend fun getChaptersByBookId(bookId: Long): List<Chapter>

    @Query("SELECT * FROM chapters WHERE bookId = :bookId ORDER BY chapterIndex ASC")
    fun getChaptersByBookIdFlow(bookId: Long): Flow<List<Chapter>>

    @Query("SELECT * FROM chapters WHERE bookId = :bookId AND chapterIndex = :chapterIndex LIMIT 1")
    suspend fun getChapterByIndex(bookId: Long, chapterIndex: Int): Chapter?

    @Query("SELECT * FROM chapters WHERE bookId = :bookId AND startPage <= :page AND endPage >= :page LIMIT 1")
    suspend fun getChapterByPage(bookId: Long, page: Int): Chapter?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChapter(chapter: Chapter)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChapters(chapters: List<Chapter>)

    @Update
    suspend fun updateChapter(chapter: Chapter)

    @Query(
        """
        UPDATE chapters
        SET content = :content,
            contentBlocksJson = :contentBlocksJson,
            renderMode = :renderMode,
            renderBaseUrl = :renderBaseUrl,
            renderHtml = :renderHtml,
            renderCssJson = :renderCssJson,
            downloaded = 1
        WHERE id = :chapterId
        """
    )
    suspend fun updateChapterContent(
        chapterId: Long,
        content: String,
        contentBlocksJson: String?,
        renderMode: String?,
        renderBaseUrl: String?,
        renderHtml: String?,
        renderCssJson: String?
    )

    @Query("DELETE FROM chapters WHERE bookId = :bookId")
    suspend fun deleteChaptersByBookId(bookId: Long)

    @Query("DELETE FROM chapters")
    suspend fun deleteAllChapters()

    @Query("SELECT COUNT(*) FROM chapters WHERE bookId = :bookId")
    suspend fun getChapterCount(bookId: Long): Int
}

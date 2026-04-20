package com.readbook.tv.data.local

import androidx.room.*
import com.readbook.tv.data.model.Book
import kotlinx.coroutines.flow.Flow

/**
 * 书籍数据访问对象
 */
@Dao
interface BookDao {

    /**
     * 获取所有书籍
     */
    @Query("SELECT * FROM books ORDER BY updatedAt DESC")
    fun getAllBooks(): Flow<List<Book>>

    /**
     * 根据 ID 获取书籍
     */
    @Query("SELECT * FROM books WHERE id = :bookId")
    suspend fun getBookById(bookId: Long): Book?

    /**
     * 获取已下载的书籍
     */
    @Query("SELECT * FROM books WHERE downloaded = 1")
    suspend fun getDownloadedBooks(): List<Book>

    /**
     * 获取所有书籍 ID
     */
    @Query("SELECT id FROM books")
    suspend fun getAllBookIds(): List<Long>

    /**
     * 插入书籍
     */
    @Upsert
    suspend fun insertBook(book: Book)

    /**
     * 批量插入书籍
     */
    @Upsert
    suspend fun insertBooks(books: List<Book>)

    /**
     * 更新书籍
     */
    @Update
    suspend fun updateBook(book: Book)

    /**
     * 更新下载状态
     */
    @Query("UPDATE books SET downloaded = :downloaded, downloadedAt = :downloadedAt WHERE id = :bookId")
    suspend fun updateDownloadStatus(bookId: Long, downloaded: Boolean, downloadedAt: Long?)

    /**
     * 删除书籍
     */
    @Delete
    suspend fun deleteBook(book: Book)

    /**
     * 根据 ID 删除书籍
     */
    @Query("DELETE FROM books WHERE id = :bookId")
    suspend fun deleteBookById(bookId: Long)

    /**
     * 清空所有书籍
     */
    @Query("DELETE FROM books")
    suspend fun deleteAllBooks()

    /**
     * 获取书籍数量
     */
    @Query("SELECT COUNT(*) FROM books")
    suspend fun getBookCount(): Int
}

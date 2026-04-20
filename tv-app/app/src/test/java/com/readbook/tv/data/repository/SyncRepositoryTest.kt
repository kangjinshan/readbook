package com.readbook.tv.data.repository

import com.readbook.tv.data.api.AddBookmarkRequest
import com.readbook.tv.data.api.ApiResponse
import com.readbook.tv.data.api.BookmarkResponse
import com.readbook.tv.data.api.PolicyData
import com.readbook.tv.data.api.SyncResponse
import com.readbook.tv.data.api.TvApi
import com.readbook.tv.data.local.BookmarkDao
import com.readbook.tv.data.local.ChapterDao
import com.readbook.tv.data.local.ProgressDao
import com.readbook.tv.data.model.Bookmark
import com.readbook.tv.data.model.ControlPolicy
import com.readbook.tv.data.model.SyncStatus
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`

class SyncRepositoryTest {

    @Test
    fun `sync uploads pending bookmarks after pulling remote data`() = runBlocking {
        val api = mock(TvApi::class.java)
        val bookRepository = mock(BookRepository::class.java)
        val chapterDao = mock(ChapterDao::class.java)
        val progressDao = mock(ProgressDao::class.java)
        val bookmarkDao = mock(BookmarkDao::class.java)
        val repository = SyncRepository(api, bookRepository, chapterDao, progressDao, bookmarkDao)

        val pendingBookmark = Bookmark(
            id = 7,
            bookId = 52,
            pageNumber = 13,
            previewText = "auto bookmark",
            syncStatus = SyncStatus.PENDING
        )

        `when`(api.sync()).thenReturn(
            ApiResponse(
                code = 0,
                data = SyncResponse(
                    child = null,
                    books = emptyList(),
                    policy = null,
                    dailyReadingResetAt = null,
                    remoteCommand = null
                ),
                message = "成功"
            )
        )
        doReturn(Unit).`when`(bookRepository).saveBooks(emptyList())
        `when`(bookRepository.getBookCount()).thenReturn(0)
        `when`(bookRepository.getPendingBookmarks()).thenReturn(listOf(pendingBookmark))
        `when`(
            api.addBookmark(
                AddBookmarkRequest(
                    bookId = pendingBookmark.bookId,
                    pageNumber = pendingBookmark.pageNumber,
                    previewText = pendingBookmark.previewText
                )
            )
        ).thenReturn(
            ApiResponse(
                code = 0,
                data = BookmarkResponse(
                    id = 99,
                    bookId = pendingBookmark.bookId,
                    pageNumber = pendingBookmark.pageNumber,
                    previewText = pendingBookmark.previewText,
                    createdAt = null
                ),
                message = "成功"
            )
        )

        val result = repository.sync()

        assertTrue(result.isSuccess)
        verify(api).addBookmark(
            AddBookmarkRequest(
                bookId = pendingBookmark.bookId,
                pageNumber = pendingBookmark.pageNumber,
                previewText = pendingBookmark.previewText
            )
        )

        val captor = ArgumentCaptor.forClass(Bookmark::class.java)
        verify(bookmarkDao).updateBookmark(captor.capture() ?: pendingBookmark)
        assertEquals(99L, captor.value.serverId)
        assertEquals(SyncStatus.SYNCED, captor.value.syncStatus)
    }

    @Test
    fun `sync persists latest policy when server returns one`() = runBlocking {
        val api = mock(TvApi::class.java)
        val bookRepository = mock(BookRepository::class.java)
        val chapterDao = mock(ChapterDao::class.java)
        val progressDao = mock(ProgressDao::class.java)
        val bookmarkDao = mock(BookmarkDao::class.java)
        var syncedPolicy: ControlPolicy? = null
        val repository = SyncRepository(
            api,
            bookRepository,
            chapterDao,
            progressDao,
            bookmarkDao
        ) { policy ->
            syncedPolicy = policy
        }

        `when`(api.sync()).thenReturn(
            ApiResponse(
                code = 0,
                data = SyncResponse(
                    child = null,
                    books = emptyList(),
                    policy = PolicyData(
                        dailyLimitMinutes = 90,
                        continuousLimitMinutes = 45,
                        restMinutes = 15,
                        forbiddenStartTime = "22:00",
                        forbiddenEndTime = "07:00",
                        allowedFontSizes = listOf("small", "medium", "large"),
                        allowedThemes = listOf("yellow", "white", "dark")
                    ),
                    dailyReadingResetAt = null,
                    remoteCommand = null
                ),
                message = "成功"
            )
        )
        doReturn(Unit).`when`(bookRepository).saveBooks(emptyList())
        `when`(bookRepository.getBookCount()).thenReturn(0)
        `when`(bookRepository.getPendingBookmarks()).thenReturn(emptyList())

        val result = repository.sync()

        assertTrue(result.isSuccess)
        assertEquals(90, syncedPolicy?.dailyLimitMinutes)
        assertEquals(45, syncedPolicy?.continuousLimitMinutes)
        assertEquals(15, syncedPolicy?.restMinutes)
    }
}

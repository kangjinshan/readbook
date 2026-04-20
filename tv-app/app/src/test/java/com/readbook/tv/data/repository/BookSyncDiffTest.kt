package com.readbook.tv.data.repository

import com.readbook.tv.data.api.BookData
import org.junit.Assert.assertEquals
import org.junit.Test

class BookSyncDiffTest {

    @Test
    fun `findRemovedBookIds returns locally cached books missing from server sync`() {
        val localBookIds = listOf(1L, 2L, 3L, 9L)
        val serverBooks = listOf(
            BookData(
                id = 1L,
                title = "Book 1",
                author = null,
                coverUrl = null,
                format = "EPUB",
                totalPages = 10,
                totalChapters = 1,
                progress = null,
                bookmarks = null
            ),
            BookData(
                id = 3L,
                title = "Book 3",
                author = null,
                coverUrl = null,
                format = "EPUB",
                totalPages = 10,
                totalChapters = 1,
                progress = null,
                bookmarks = null
            )
        )

        assertEquals(listOf(2L, 9L), findRemovedBookIds(localBookIds, serverBooks))
    }
}

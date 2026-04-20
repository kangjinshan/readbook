package com.readbook.tv.data.repository

import com.readbook.tv.data.api.BookmarkData
import com.readbook.tv.data.model.Bookmark
import com.readbook.tv.data.model.SyncStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BookmarkSyncMergeTest {

    @Test
    fun `sync merge updates existing page bookmark with server id instead of duplicating`() {
        val local = listOf(
            Bookmark(
                id = 1,
                bookId = 9,
                pageNumber = 12,
                previewText = "local",
                serverId = null,
                syncStatus = SyncStatus.PENDING
            )
        )
        val remote = listOf(
            BookmarkData(
                id = 88,
                pageNumber = 12,
                previewText = "remote",
                createdAt = "2026-04-18T00:00:00.000Z"
            )
        )

        val merged = BookmarkSyncMerge.merge(bookId = 9, local = local, remote = remote)

        assertEquals(1, merged.size)
        assertEquals(88L, merged.single().serverId)
        assertEquals("remote", merged.single().previewText)
        assertEquals(SyncStatus.SYNCED, merged.single().syncStatus)
    }

    @Test
    fun `sync merge keeps unsynced local bookmark when server does not have it`() {
        val local = listOf(
            Bookmark(
                id = 5,
                bookId = 9,
                pageNumber = 22,
                previewText = "offline",
                serverId = null,
                syncStatus = SyncStatus.PENDING
            )
        )

        val merged = BookmarkSyncMerge.merge(bookId = 9, local = local, remote = emptyList())

        assertEquals(1, merged.size)
        assertEquals(22, merged.single().pageNumber)
        assertNull(merged.single().serverId)
        assertEquals(SyncStatus.PENDING, merged.single().syncStatus)
    }
}

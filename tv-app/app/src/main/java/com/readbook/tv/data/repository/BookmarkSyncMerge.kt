package com.readbook.tv.data.repository

import com.readbook.tv.data.api.BookmarkData
import com.readbook.tv.data.model.Bookmark
import com.readbook.tv.data.model.SyncStatus

object BookmarkSyncMerge {
    fun merge(
        bookId: Long,
        local: List<Bookmark>,
        remote: List<BookmarkData>,
        parseTimestamp: (String?) -> Long = { System.currentTimeMillis() }
    ): List<Bookmark> {
        val mergedByPage = linkedMapOf<Int, Bookmark>()

        local.filter { it.serverId == null }.forEach { bookmark ->
            mergedByPage[bookmark.pageNumber] = bookmark
        }

        remote.forEach { bookmark ->
            val existing = local.firstOrNull { it.pageNumber == bookmark.pageNumber }
            mergedByPage[bookmark.pageNumber] = Bookmark(
                id = existing?.id ?: 0,
                bookId = bookId,
                pageNumber = bookmark.pageNumber,
                chapterIndex = existing?.chapterIndex,
                previewText = bookmark.previewText ?: existing?.previewText,
                createdAt = existing?.createdAt ?: parseTimestamp(bookmark.createdAt),
                serverId = bookmark.id,
                syncStatus = SyncStatus.SYNCED
            )
        }

        return mergedByPage.values.sortedBy { it.pageNumber }
    }
}
